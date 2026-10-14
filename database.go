package main

// Module: database. BCode acting as a client to the user's own external
// databases — unrelated to ADR-0002 (BCode's own storage stays local JSON).
// See .specs/modules/database.md and .specs/adrs/0009-mysql-client.md.

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"
	"golang.org/x/crypto/ssh"
)

// ─── Data Types ──────────────────────────────────────────────────────────────

// DBConnection is what the frontend sees: never carries a password (MySQL's
// or the SSH tunnel's). SSH tunnel fields and ExtraParams added 2026-10-14 —
// see .specs/tasks/mysql-ssh-tunnel-and-connection-modal.md.
type DBConnection struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	Database string `json:"database"` // "" = not locked, browse all databases
	Folder   string `json:"folder"`   // "" = ungrouped

	// SSH tunnel: off by default. When on, the MySQL host/port above are
	// resolved FROM INSIDE the tunnel (typically 127.0.0.1:3306 on the SSH
	// server itself), not from the network BCode's own machine is on.
	UseSSHTunnel bool   `json:"useSSHTunnel"`
	SSHHost      string `json:"sshHost"`
	SSHPort      int    `json:"sshPort"`
	SSHUser      string `json:"sshUser"`

	// DSN query-string parameters (go-sql-driver/mysql's own param names —
	// NOT the MySQL Connector/J ones a JDBC-based client like DBeaver shows).
	// Nil/empty on a connection saved before this field existed; callers
	// needing a DSN fall back to the global default (effectiveExtraParams)
	// rather than treating that as "no params at all" — see openConn.
	ExtraParams map[string]string `json:"extraParams"`
}

// DBConnectionInput is what SaveDBConnection accepts. Both passwords are
// plaintext here only as method parameters; each is encrypted before
// touching disk and is never marshaled back to the frontend (see
// storedConnection below, which is the on-disk shape).
type DBConnectionInput struct {
	ID       string `json:"id"` // empty on create
	Name     string `json:"name"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	Password string `json:"password"` // "" on edit = keep existing password
	Database string `json:"database"`
	Folder   string `json:"folder"`

	UseSSHTunnel bool   `json:"useSSHTunnel"`
	SSHHost      string `json:"sshHost"`
	SSHPort      int    `json:"sshPort"`
	SSHUser      string `json:"sshUser"`
	SSHPassword  string `json:"sshPassword"` // "" on edit = keep existing SSH password

	ExtraParams map[string]string `json:"extraParams"`
}

// storedConnection is the on-disk shape in connections.json — same as
// DBConnection plus the encrypted passwords. Never sent to the frontend as-is.
type storedConnection struct {
	DBConnection
	PasswordEnc    string `json:"passwordEnc"`
	SSHPasswordEnc string `json:"sshPasswordEnc"`
}

type ColumnInfo struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Nullable bool   `json:"nullable"`
	Key      string `json:"key"`
}

// ConstraintInfo is a table-level constraint (PK, UNIQUE, CHECK) — FKs have
// their own richer ForeignKeyInfo instead, even though they're technically
// also rows in table_constraints.
type ConstraintInfo struct {
	Name    string   `json:"name"`
	Type    string   `json:"type"` // PRIMARY KEY, UNIQUE, CHECK
	Columns []string `json:"columns"`
}

// ForeignKeyInfo is used both ways: outbound (this table's own FKs) and
// inbound ("References" — other tables' FKs that point at this one). Which
// one a given slice holds is determined by which query filled it, not by a
// field on the struct itself.
type ForeignKeyInfo struct {
	Name             string `json:"name"`
	Column           string `json:"column"`
	ReferencedTable  string `json:"referencedTable"`
	ReferencedColumn string `json:"referencedColumn"`
	ReferencedSchema string `json:"referencedSchema"`
	OnUpdate         string `json:"onUpdate"`
	OnDelete         string `json:"onDelete"`
}

type TriggerInfo struct {
	Name      string `json:"name"`
	Timing    string `json:"timing"` // BEFORE, AFTER
	Event     string `json:"event"`  // INSERT, UPDATE, DELETE
	Statement string `json:"statement"`
}

type IndexInfo struct {
	Name    string   `json:"name"`
	Unique  bool     `json:"unique"`
	Type    string   `json:"type"` // BTREE, HASH, ...
	Columns []string `json:"columns"`
}

type PartitionInfo struct {
	Name        string `json:"name"`
	Method      string `json:"method"` // RANGE, LIST, HASH, KEY
	Expression  string `json:"expression"`
	Description string `json:"description"`
	Rows        int64  `json:"rows"`
}

type TableStatistics struct {
	Engine        string `json:"engine"`
	RowsEstimate  int64  `json:"rowsEstimate"`
	DataLength    int64  `json:"dataLength"`
	IndexLength   int64  `json:"indexLength"`
	AvgRowLength  int64  `json:"avgRowLength"`
	AutoIncrement int64  `json:"autoIncrement"`
	Collation     string `json:"collation"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
}

// TableDetails backs the table tab's Properties sub-tab — one combined
// fetch (GetTableDetails) rather than one Wails-bound round trip per
// section, since they're always viewed together.
type TableDetails struct {
	Constraints []ConstraintInfo `json:"constraints"`
	ForeignKeys []ForeignKeyInfo `json:"foreignKeys"`
	References  []ForeignKeyInfo `json:"references"`
	Triggers    []TriggerInfo    `json:"triggers"`
	Indexes     []IndexInfo      `json:"indexes"`
	Partitions  []PartitionInfo  `json:"partitions"`
	Statistics  TableStatistics  `json:"statistics"`
	DDL         string           `json:"ddl"`
}

type QueryResult struct {
	Columns      []string        `json:"columns"`
	Rows         [][]interface{} `json:"rows"`
	RowCount     int             `json:"rowCount"`
	RowsAffected int64           `json:"rowsAffected"`
	DurationMs   int64           `json:"durationMs"`
	Truncated    bool            `json:"truncated"`
	Error        string          `json:"error,omitempty"`
}

// SavedQuery is a query tab's persisted content — global, not per-workspace,
// same as connections (ADR-0009).
type SavedQuery struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	ConnectionID string `json:"connectionId"`
	Database     string `json:"database"`
	SQL          string `json:"sql"`
	UpdatedAt    string `json:"updatedAt"`
	Folder       string `json:"folder"` // "" = ungrouped
}

// Row cap for a single RunQuery — a manual SQL client use case, not a bulk
// export tool. Documented limit, not a silent one (QueryResult.Truncated).
const maxQueryRows = 5000

// System schemas hidden from the database tree — a user browsing their own
// data doesn't want MySQL's internal schemas cluttering it.
var systemSchemas = map[string]bool{
	"information_schema": true,
	"performance_schema": true,
	"mysql":              true,
	"sys":                true,
}

// ─── Storage paths ───────────────────────────────────────────────────────────

func dbDir() string {
	return filepath.Join(bcodeDir(), "db")
}

func connectionsPath() string {
	return filepath.Join(dbDir(), "connections.json")
}

func defaultExtraParamsPath() string {
	return filepath.Join(dbDir(), "default_extra_params.json")
}

func dbKeyPath() string {
	return filepath.Join(dbDir(), "key")
}

func queriesDir() string {
	return filepath.Join(bcodeDir(), "queries")
}

// ─── Encryption (ADR-0009) ──────────────────────────────────────────────────
// AES-256-GCM, key stored locally at 0600. This protects the password from
// casual exposure (a screenshot, a synced dotfiles backup) but NOT from
// another process running as the same OS user — that process can read the
// key file exactly as BCode does. Documented limit, not a gap to silently
// "fix" later without a new ADR.

func dbEncryptionKey() ([]byte, error) {
	if err := os.MkdirAll(dbDir(), 0755); err != nil {
		return nil, err
	}
	data, err := os.ReadFile(dbKeyPath())
	if err == nil && len(data) == 32 {
		return data, nil
	}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	if err := os.WriteFile(dbKeyPath(), key, 0600); err != nil {
		return nil, err
	}
	return key, nil
}

func encryptPassword(plain string) (string, error) {
	if plain == "" {
		return "", nil
	}
	key, err := dbEncryptionKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plain), nil)
	return base64.StdEncoding.EncodeToString(sealed), nil
}

func decryptPassword(enc string) (string, error) {
	if enc == "" {
		return "", nil
	}
	key, err := dbEncryptionKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	raw, err := base64.StdEncoding.DecodeString(enc)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", fmt.Errorf("invalid encrypted password")
	}
	nonce, ciphertext := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

// ─── Connection storage ──────────────────────────────────────────────────────

func readStoredConnections() []storedConnection {
	data, err := os.ReadFile(connectionsPath())
	if err != nil {
		return []storedConnection{}
	}
	list := []storedConnection{}
	if err := json.Unmarshal(data, &list); err != nil {
		return []storedConnection{}
	}
	if list == nil {
		list = []storedConnection{}
	}
	return list
}

func writeStoredConnections(list []storedConnection) error {
	if err := os.MkdirAll(dbDir(), 0755); err != nil {
		return err
	}
	data, err := json.Marshal(list)
	if err != nil {
		return err
	}
	return os.WriteFile(connectionsPath(), data, 0644)
}

// seedExtraParams is the one-time starting point for the global default
// (first launch, no default_extra_params.json yet) — this exact value was
// hardcoded directly into openConn's DSN before this task, so a fresh
// install's default behavior doesn't change.
func seedExtraParams() map[string]string {
	return map[string]string{"parseTime": "true"}
}

// loadDefaultExtraParams returns the saved global default, or the seed if
// the file doesn't exist yet (nothing saved it there so far).
func loadDefaultExtraParams() map[string]string {
	data, err := os.ReadFile(defaultExtraParamsPath())
	if err != nil {
		return seedExtraParams()
	}
	m := map[string]string{}
	if err := json.Unmarshal(data, &m); err != nil || m == nil {
		return seedExtraParams()
	}
	return m
}

func saveDefaultExtraParams(m map[string]string) error {
	if err := os.MkdirAll(dbDir(), 0755); err != nil {
		return err
	}
	data, err := json.Marshal(m)
	if err != nil {
		return err
	}
	return os.WriteFile(defaultExtraParamsPath(), data, 0644)
}

// effectiveExtraParams: a connection saved before this field existed has a
// nil/empty map — treated as "use the global default", not as "no params at
// all" (which would silently drop the parseTime=true every connection relied
// on before this task). Only applies to resolving what to actually use (DSN
// building, pre-filling the edit form); never written back to the
// connection's own stored value just for being read.
func effectiveExtraParams(m map[string]string) map[string]string {
	if len(m) == 0 {
		return loadDefaultExtraParams()
	}
	return m
}

func sameExtraParams(a, b map[string]string) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if b[k] != v {
			return false
		}
	}
	return true
}

// GetDefaultExtraParams returns the current global default — used to
// pre-fill the Extra Params tab when creating a NEW connection. Editing an
// existing connection pre-fills from its own saved ExtraParams instead (see
// effectiveExtraParams), not this.
func (a *App) GetDefaultExtraParams() map[string]string {
	return loadDefaultExtraParams()
}

// ListDBConnections never includes a password field.
func (a *App) ListDBConnections() []DBConnection {
	stored := readStoredConnections()
	out := make([]DBConnection, 0, len(stored))
	for _, s := range stored {
		out = append(out, s.DBConnection)
	}
	return out
}

// SaveDBConnection upserts by id (creates one if input.ID is empty). Leaving
// Password empty on an edit keeps the existing encrypted password unchanged —
// the password is never round-tripped to the frontend to compare against.
func (a *App) SaveDBConnection(input DBConnectionInput) (string, error) {
	list := readStoredConnections()

	if input.ID == "" {
		input.ID = fmt.Sprintf("%d", time.Now().UnixNano())
	}

	buildConn := func(passwordEnc, sshPasswordEnc string) storedConnection {
		return storedConnection{
			DBConnection: DBConnection{
				ID: input.ID, Name: input.Name, Host: input.Host,
				Port: input.Port, User: input.User, Database: input.Database,
				Folder:       input.Folder,
				UseSSHTunnel: input.UseSSHTunnel, SSHHost: input.SSHHost,
				SSHPort: input.SSHPort, SSHUser: input.SSHUser,
				ExtraParams: input.ExtraParams,
			},
			PasswordEnc:    passwordEnc,
			SSHPasswordEnc: sshPasswordEnc,
		}
	}

	found := false
	for i, s := range list {
		if s.ID != input.ID {
			continue
		}
		found = true
		encPassword := s.PasswordEnc // keep existing unless a new one is given
		if input.Password != "" {
			enc, err := encryptPassword(input.Password)
			if err != nil {
				return "", err
			}
			encPassword = enc
		}
		encSSHPassword := s.SSHPasswordEnc
		if input.SSHPassword != "" {
			enc, err := encryptPassword(input.SSHPassword)
			if err != nil {
				return "", err
			}
			encSSHPassword = enc
		}
		list[i] = buildConn(encPassword, encSSHPassword)
		break
	}
	if !found {
		enc, err := encryptPassword(input.Password)
		if err != nil {
			return "", err
		}
		sshEnc, err := encryptPassword(input.SSHPassword)
		if err != nil {
			return "", err
		}
		list = append(list, buildConn(enc, sshEnc))
	}

	if err := writeStoredConnections(list); err != nil {
		return "", err
	}

	// Last-write-wins: whatever Extra Params the user actually saved (on any
	// connection, new or edited) become the pre-fill for the NEXT new
	// connection — not retroactive to other already-saved connections.
	if len(input.ExtraParams) > 0 && !sameExtraParams(input.ExtraParams, loadDefaultExtraParams()) {
		if err := saveDefaultExtraParams(input.ExtraParams); err != nil {
			return "", err
		}
	}

	return input.ID, nil
}

func (a *App) DeleteDBConnection(id string) error {
	list := readStoredConnections()
	filtered := make([]storedConnection, 0, len(list))
	for _, s := range list {
		if s.ID != id {
			filtered = append(filtered, s)
		}
	}
	return writeStoredConnections(filtered)
}

func findStoredConnection(id string) (storedConnection, error) {
	for _, s := range readStoredConnections() {
		if s.ID == id {
			return s, nil
		}
	}
	return storedConnection{}, fmt.Errorf("connection %s not found", id)
}

// ─── SSH tunnel ──────────────────────────────────────────────────────────────
// Password auth only for now (no private key) — confirmed with the user,
// .specs/tasks/mysql-ssh-tunnel-and-connection-modal.md. Host key is not
// verified (ssh.InsecureIgnoreHostKey()), also an explicit, documented
// out-of-scope decision for this version, not an oversight.

// sshClosingConn closes its SSH client along with the forwarded connection —
// each dial below opens a fresh *ssh.Client (see sshTunnelDialFunc), so
// nothing else would ever close it otherwise.
type sshClosingConn struct {
	net.Conn
	sshClient *ssh.Client
}

func (c *sshClosingConn) Close() error {
	connErr := c.Conn.Close()
	sshErr := c.sshClient.Close()
	if connErr != nil {
		return connErr
	}
	return sshErr
}

// sshTunnelDialFunc returns a go-sql-driver/mysql DialContextFunc that routes
// through an SSH tunnel to sc's SSH host instead of dialing addr directly.
// Opens a brand new SSH connection per dial rather than sharing/pooling one
// — simpler than coordinating a shared *ssh.Client's lifetime with
// *sql.DB.Close() (this app always does db, _, err := openConn(...); defer
// db.Close() right after use, never a long-lived pool, so the extra
// handshake cost per use is not a real concern here).
func sshTunnelDialFunc(sc storedConnection) mysql.DialContextFunc {
	return func(ctx context.Context, addr string) (net.Conn, error) {
		sshPassword, err := decryptPassword(sc.SSHPasswordEnc)
		if err != nil {
			return nil, fmt.Errorf("ssh tunnel: could not decrypt stored password: %w", err)
		}
		config := &ssh.ClientConfig{
			User:            sc.SSHUser,
			Auth:            []ssh.AuthMethod{ssh.Password(sshPassword)},
			HostKeyCallback: ssh.InsecureIgnoreHostKey(),
			Timeout:         10 * time.Second,
		}
		sshAddr := fmt.Sprintf("%s:%d", sc.SSHHost, sc.SSHPort)
		dialer := &net.Dialer{Timeout: config.Timeout}
		netConn, err := dialer.DialContext(ctx, "tcp", sshAddr)
		if err != nil {
			return nil, fmt.Errorf("ssh tunnel: could not reach %s: %w", sshAddr, err)
		}
		sshConn, chans, reqs, err := ssh.NewClientConn(netConn, sshAddr, config)
		if err != nil {
			netConn.Close()
			return nil, fmt.Errorf("ssh tunnel: %w", err)
		}
		client := ssh.NewClient(sshConn, chans, reqs)
		conn, err := client.DialContext(ctx, "tcp", addr)
		if err != nil {
			client.Close()
			return nil, fmt.Errorf("ssh tunnel: could not reach %s through the tunnel: %w", addr, err)
		}
		return &sshClosingConn{Conn: conn, sshClient: client}, nil
	}
}

// sshTunnelNetwork is unique per connection so concurrent tunnels for
// different connections never collide in go-sql-driver/mysql's global dial
// registry (RegisterDialContext is keyed by network name, process-wide).
func sshTunnelNetwork(connectionID string) string {
	return "sshtunnel-" + connectionID
}

// buildDSN assembles a go-sql-driver/mysql DSN. network is "tcp" for a direct
// connection, or a per-connection custom network name registered against an
// SSH tunnel dialer (see dialSSHTunnel) when the connection uses one.
// extraParams are go-sql-driver/mysql's own DSN parameter names (parseTime,
// loc, charset, etc.) — NOT the MySQL Connector/J ones a JDBC client like
// DBeaver shows, a different driver with a different parameter set entirely.
// A connection saved before this field existed (nil/empty map) falls back to
// the global default instead of silently dropping parseTime=true, which
// every connection relied on before this was configurable.
func buildDSN(network, user, password, host string, port int, database string, extraParams map[string]string) string {
	dsn := fmt.Sprintf("%s:%s@%s(%s:%d)/%s", user, password, network, host, port, database)
	params := effectiveExtraParams(extraParams)
	if len(params) == 0 {
		return dsn
	}
	q := url.Values{}
	for k, v := range params {
		q.Set(k, v)
	}
	// url.Values.Encode() sorts by key — deterministic DSN, not load-bearing
	// for correctness but makes the generated string reproducible/testable.
	return dsn + "?" + q.Encode()
}

// openConn loads, decrypts and opens a connection. Caller must Close() the
// returned *sql.DB. database, if non-empty, is selected via the DSN so
// queries can use unqualified table names.
func openConn(id string, database string) (*sql.DB, storedConnection, error) {
	sc, err := findStoredConnection(id)
	if err != nil {
		return nil, sc, err
	}
	password, err := decryptPassword(sc.PasswordEnc)
	if err != nil {
		return nil, sc, fmt.Errorf("could not decrypt stored password: %w", err)
	}
	network := "tcp"
	if sc.UseSSHTunnel {
		network = sshTunnelNetwork(sc.ID)
		mysql.RegisterDialContext(network, sshTunnelDialFunc(sc))
	}
	dsn := buildDSN(network, sc.User, password, sc.Host, sc.Port, database, sc.ExtraParams)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, sc, err
	}
	return db, sc, nil
}

// TestDBConnection opens and pings, does not keep the connection.
func (a *App) TestDBConnection(id string) error {
	db, _, err := openConn(id, "")
	if err != nil {
		return err
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return db.PingContext(ctx)
}

// ─── Introspection ───────────────────────────────────────────────────────────

// ListDatabases: if the connection is locked to one database, returns just
// that one without touching the network (ADR-0009 tree-shape rule).
func (a *App) ListDatabases(connectionID string) ([]string, error) {
	sc, err := findStoredConnection(connectionID)
	if err != nil {
		return nil, err
	}
	if sc.Database != "" {
		return []string{sc.Database}, nil
	}

	db, _, err := openConn(connectionID, "")
	if err != nil {
		return nil, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	rows, err := db.QueryContext(ctx, "SHOW DATABASES")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			continue
		}
		if !systemSchemas[name] {
			out = append(out, name)
		}
	}
	return out, rows.Err()
}

// ListTables uses information_schema (fully-qualified) rather than `USE` +
// `SHOW TABLES`, since a pooled *sql.DB may reuse connections across calls
// and USE would leak selected-database state between callers.
func (a *App) ListTables(connectionID, database string) ([]string, error) {
	db, _, err := openConn(connectionID, "")
	if err != nil {
		return nil, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	rows, err := db.QueryContext(ctx,
		"SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name",
		database)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			continue
		}
		out = append(out, name)
	}
	return out, rows.Err()
}

func (a *App) DescribeTable(connectionID, database, table string) ([]ColumnInfo, error) {
	db, _, err := openConn(connectionID, "")
	if err != nil {
		return nil, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	rows, err := db.QueryContext(ctx,
		`SELECT column_name, column_type, is_nullable, column_key
		 FROM information_schema.columns
		 WHERE table_schema = ? AND table_name = ?
		 ORDER BY ordinal_position`,
		database, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ColumnInfo{}
	for rows.Next() {
		var name, colType, nullable, key string
		if err := rows.Scan(&name, &colType, &nullable, &key); err != nil {
			continue
		}
		out = append(out, ColumnInfo{
			Name: name, Type: colType, Nullable: nullable == "YES", Key: key,
		})
	}
	return out, rows.Err()
}

// quoteIdent wraps a MySQL identifier in backticks, doubling any backtick
// already inside it — the standard MySQL identifier-escaping rule. Needed
// for SHOW CREATE TABLE, since identifiers can't be bound as query
// parameters the way values can.
func quoteIdent(s string) string {
	return "`" + strings.ReplaceAll(s, "`", "``") + "`"
}

// GetTableDetails backs the table tab's Properties sub-tab: one opened
// connection, several information_schema queries plus SHOW CREATE TABLE,
// instead of one Wails-bound round trip per section (DescribeTable's
// existing one-round-trip-per-view precedent).
func (a *App) GetTableDetails(connectionID, database, table string) (TableDetails, error) {
	// Every slice starts non-nil — a Go nil slice marshals to JSON `null`,
	// not `[]`, which crashed the frontend (`details.foreignKeys.length` on
	// `null`) for any section with zero rows. Initialized upfront so a
	// query that finds nothing just never appends, instead of every call
	// site needing its own empty-slice fallback.
	details := TableDetails{
		Constraints: []ConstraintInfo{},
		ForeignKeys: []ForeignKeyInfo{},
		References:  []ForeignKeyInfo{},
		Triggers:    []TriggerInfo{},
		Indexes:     []IndexInfo{},
		Partitions:  []PartitionInfo{},
	}

	db, _, err := openConn(connectionID, "")
	if err != nil {
		return details, err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Constraints (PK, UNIQUE, CHECK) — FKs are also rows here but get their
	// own richer query below instead.
	constraintRows, err := db.QueryContext(ctx,
		`SELECT tc.constraint_name, tc.constraint_type, kcu.column_name
		 FROM information_schema.table_constraints tc
		 JOIN information_schema.key_column_usage kcu
		   ON tc.constraint_name = kcu.constraint_name
		  AND tc.table_schema = kcu.table_schema
		  AND tc.table_name = kcu.table_name
		 WHERE tc.table_schema = ? AND tc.table_name = ? AND tc.constraint_type != 'FOREIGN KEY'
		 ORDER BY tc.constraint_name, kcu.ordinal_position`,
		database, table)
	if err != nil {
		return details, err
	}
	constraintsByName := map[string]*ConstraintInfo{}
	var constraintOrder []string
	for constraintRows.Next() {
		var name, ctype, col string
		if err := constraintRows.Scan(&name, &ctype, &col); err != nil {
			continue
		}
		c, ok := constraintsByName[name]
		if !ok {
			c = &ConstraintInfo{Name: name, Type: ctype}
			constraintsByName[name] = c
			constraintOrder = append(constraintOrder, name)
		}
		c.Columns = append(c.Columns, col)
	}
	constraintRows.Close()
	if err := constraintRows.Err(); err != nil {
		return details, err
	}
	for _, name := range constraintOrder {
		details.Constraints = append(details.Constraints, *constraintsByName[name])
	}

	// Foreign keys (outbound) — this table's own FKs pointing at others.
	fks, err := queryForeignKeys(ctx, db,
		`SELECT kcu.constraint_name, kcu.column_name, kcu.referenced_table_schema,
		        kcu.referenced_table_name, kcu.referenced_column_name,
		        rc.update_rule, rc.delete_rule
		 FROM information_schema.key_column_usage kcu
		 JOIN information_schema.referential_constraints rc
		   ON kcu.constraint_name = rc.constraint_name AND kcu.table_schema = rc.constraint_schema
		 WHERE kcu.table_schema = ? AND kcu.table_name = ? AND kcu.referenced_table_name IS NOT NULL
		 ORDER BY kcu.constraint_name, kcu.ordinal_position`,
		database, table)
	if err != nil {
		return details, err
	}
	details.ForeignKeys = fks

	// References (inbound) — other tables' FKs that point at this one.
	refs, err := queryForeignKeys(ctx, db,
		`SELECT kcu.constraint_name, kcu.column_name, kcu.table_schema,
		        kcu.table_name, kcu.referenced_column_name,
		        rc.update_rule, rc.delete_rule
		 FROM information_schema.key_column_usage kcu
		 JOIN information_schema.referential_constraints rc
		   ON kcu.constraint_name = rc.constraint_name AND kcu.table_schema = rc.constraint_schema
		 WHERE kcu.referenced_table_schema = ? AND kcu.referenced_table_name = ?
		 ORDER BY kcu.constraint_name, kcu.ordinal_position`,
		database, table)
	if err != nil {
		return details, err
	}
	details.References = refs

	// Triggers.
	triggerRows, err := db.QueryContext(ctx,
		`SELECT trigger_name, action_timing, event_manipulation, action_statement
		 FROM information_schema.triggers
		 WHERE event_object_schema = ? AND event_object_table = ?
		 ORDER BY trigger_name`,
		database, table)
	if err != nil {
		return details, err
	}
	for triggerRows.Next() {
		var t TriggerInfo
		if err := triggerRows.Scan(&t.Name, &t.Timing, &t.Event, &t.Statement); err != nil {
			continue
		}
		details.Triggers = append(details.Triggers, t)
	}
	triggerRows.Close()
	if err := triggerRows.Err(); err != nil {
		return details, err
	}

	// Index — information_schema.statistics (also index cardinality, but
	// per-column cardinality isn't surfaced here, just name/uniqueness/type).
	idxRows, err := db.QueryContext(ctx,
		`SELECT index_name, non_unique, index_type, column_name
		 FROM information_schema.statistics
		 WHERE table_schema = ? AND table_name = ?
		 ORDER BY index_name, seq_in_index`,
		database, table)
	if err != nil {
		return details, err
	}
	indexByName := map[string]*IndexInfo{}
	var indexOrder []string
	for idxRows.Next() {
		var name, idxType, col string
		var nonUnique int
		if err := idxRows.Scan(&name, &nonUnique, &idxType, &col); err != nil {
			continue
		}
		idx, ok := indexByName[name]
		if !ok {
			idx = &IndexInfo{Name: name, Unique: nonUnique == 0, Type: idxType}
			indexByName[name] = idx
			indexOrder = append(indexOrder, name)
		}
		idx.Columns = append(idx.Columns, col)
	}
	idxRows.Close()
	if err := idxRows.Err(); err != nil {
		return details, err
	}
	for _, name := range indexOrder {
		details.Indexes = append(details.Indexes, *indexByName[name])
	}

	// Partitions — empty slice (not an error) for a non-partitioned table.
	partRows, err := db.QueryContext(ctx,
		`SELECT partition_name, COALESCE(partition_method, ''), COALESCE(partition_expression, ''),
		        COALESCE(partition_description, ''), COALESCE(table_rows, 0)
		 FROM information_schema.partitions
		 WHERE table_schema = ? AND table_name = ? AND partition_name IS NOT NULL
		 ORDER BY partition_ordinal_position`,
		database, table)
	if err != nil {
		return details, err
	}
	for partRows.Next() {
		var p PartitionInfo
		if err := partRows.Scan(&p.Name, &p.Method, &p.Expression, &p.Description, &p.Rows); err != nil {
			continue
		}
		details.Partitions = append(details.Partitions, p)
	}
	partRows.Close()
	if err := partRows.Err(); err != nil {
		return details, err
	}

	// Statistics.
	err = db.QueryRowContext(ctx,
		`SELECT engine, COALESCE(table_rows, 0), COALESCE(data_length, 0), COALESCE(index_length, 0),
		        COALESCE(avg_row_length, 0), COALESCE(auto_increment, 0), COALESCE(table_collation, ''),
		        COALESCE(create_time, ''), COALESCE(update_time, '')
		 FROM information_schema.tables
		 WHERE table_schema = ? AND table_name = ?`,
		database, table,
	).Scan(&details.Statistics.Engine, &details.Statistics.RowsEstimate, &details.Statistics.DataLength,
		&details.Statistics.IndexLength, &details.Statistics.AvgRowLength, &details.Statistics.AutoIncrement,
		&details.Statistics.Collation, &details.Statistics.CreatedAt, &details.Statistics.UpdatedAt)
	if err != nil {
		return details, err
	}

	// DDL.
	var ddlTableName, ddl string
	err = db.QueryRowContext(ctx,
		"SHOW CREATE TABLE "+quoteIdent(database)+"."+quoteIdent(table),
	).Scan(&ddlTableName, &ddl)
	if err != nil {
		return details, err
	}
	details.DDL = ddl

	return details, nil
}

// queryForeignKeys runs one of GetTableDetails' two (outbound/inbound) FK
// queries — same column shape either way, just a different WHERE clause and
// which columns mean "this table" vs. "the referenced table".
func queryForeignKeys(ctx context.Context, db *sql.DB, query, database, table string) ([]ForeignKeyInfo, error) {
	rows, err := db.QueryContext(ctx, query, database, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ForeignKeyInfo{}
	for rows.Next() {
		var fk ForeignKeyInfo
		if err := rows.Scan(&fk.Name, &fk.Column, &fk.ReferencedSchema, &fk.ReferencedTable,
			&fk.ReferencedColumn, &fk.OnUpdate, &fk.OnDelete); err != nil {
			continue
		}
		out = append(out, fk)
	}
	return out, rows.Err()
}

// ─── Query execution ─────────────────────────────────────────────────────────

// RunQuery executes exactly the SQL text given — no statement-type
// allowlist/blocklist (ADR-0009: the user's own database, their risk, same
// trust model as any SQL client). One statement per call in this version;
// the caller is responsible for not sending multiple ;-separated statements.
// statementReturnsRows decides Query vs Exec by looking at the statement's
// first keyword, rather than trying Query and falling back to Exec on error:
// go-sql-driver/mysql's Query does NOT error on INSERT/UPDATE/DELETE (MySQL's
// wire protocol allows any statement via COM_QUERY), so a try-then-fallback
// approach would silently lose RowsAffected — worse, retrying via Exec after
// a "failed" Query would risk running the statement twice. Found and fixed
// during manual verification against a real MySQL server (2026-09-26).
func statementReturnsRows(sqlText string) bool {
	s := strings.TrimSpace(sqlText)
	// Strip a leading SQL comment or two, best-effort.
	for strings.HasPrefix(s, "--") || strings.HasPrefix(s, "/*") {
		if strings.HasPrefix(s, "--") {
			if i := strings.IndexByte(s, '\n'); i >= 0 {
				s = strings.TrimSpace(s[i+1:])
			} else {
				s = ""
			}
		} else if i := strings.Index(s, "*/"); i >= 0 {
			s = strings.TrimSpace(s[i+2:])
		} else {
			break
		}
	}
	upper := strings.ToUpper(s)
	for _, kw := range []string{"SELECT", "SHOW", "DESCRIBE", "DESC ", "EXPLAIN", "WITH"} {
		if strings.HasPrefix(upper, kw) {
			return true
		}
	}
	return false
}

func (a *App) RunQuery(connectionID, database, sqlText string) QueryResult {
	start := time.Now()
	db, _, err := openConn(connectionID, database)
	if err != nil {
		return QueryResult{Error: err.Error()}
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	if !statementReturnsRows(sqlText) {
		res, execErr := db.ExecContext(ctx, sqlText)
		if execErr != nil {
			return QueryResult{Error: execErr.Error(), DurationMs: time.Since(start).Milliseconds()}
		}
		affected, _ := res.RowsAffected()
		return QueryResult{
			Columns: []string{}, Rows: [][]interface{}{},
			RowsAffected: affected, DurationMs: time.Since(start).Milliseconds(),
		}
	}

	rows, queryErr := db.QueryContext(ctx, sqlText)
	if queryErr != nil {
		return QueryResult{Error: queryErr.Error(), DurationMs: time.Since(start).Milliseconds()}
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return QueryResult{Error: err.Error(), DurationMs: time.Since(start).Milliseconds()}
	}

	result := QueryResult{Columns: cols, Rows: [][]interface{}{}}
	scanTargets := make([]interface{}, len(cols))
	scanPtrs := make([]interface{}, len(cols))
	for i := range scanTargets {
		scanPtrs[i] = &scanTargets[i]
	}

	for rows.Next() {
		if result.RowCount >= maxQueryRows {
			result.Truncated = true
			break
		}
		if err := rows.Scan(scanPtrs...); err != nil {
			return QueryResult{Error: err.Error(), DurationMs: time.Since(start).Milliseconds()}
		}
		row := make([]interface{}, len(cols))
		for i, v := range scanTargets {
			row[i] = jsonSafeValue(v)
		}
		result.Rows = append(result.Rows, row)
		result.RowCount++
	}
	result.DurationMs = time.Since(start).Milliseconds()
	if rows.Err() != nil {
		result.Error = rows.Err().Error()
	}
	return result
}

// jsonSafeValue converts a driver-scanned value into something JSON-safe for
// the Wails bridge: []byte -> string, time.Time -> RFC3339, nil stays nil.
func jsonSafeValue(v interface{}) interface{} {
	switch t := v.(type) {
	case nil:
		return nil
	case []byte:
		return string(t)
	case time.Time:
		return t.Format(time.RFC3339)
	default:
		return t
	}
}

// ─── Saved queries (global, not per-workspace — ADR-0009) ──────────────────

func savedQueryPath(id string) string {
	return filepath.Join(queriesDir(), id+".json")
}

func (a *App) ListSavedQueries() []SavedQuery {
	entries, err := os.ReadDir(queriesDir())
	if err != nil {
		return []SavedQuery{}
	}
	out := []SavedQuery{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(queriesDir(), e.Name()))
		if err != nil {
			continue
		}
		var sq SavedQuery
		if err := json.Unmarshal(data, &sq); err != nil {
			continue
		}
		out = append(out, sq)
	}
	return out
}

// SaveQueryTab returns the query's id — the frontend has no other way to
// learn the id generated on first save (found while wiring the explicit
// "Save" action: the previous void-returning signature meant a newly created
// query could never be identified for a later update).
func (a *App) SaveQueryTab(sq SavedQuery) (string, error) {
	if err := os.MkdirAll(queriesDir(), 0755); err != nil {
		return "", err
	}
	if sq.ID == "" {
		sq.ID = fmt.Sprintf("%d", time.Now().UnixNano())
	}
	sq.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	data, err := json.Marshal(sq)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(savedQueryPath(sq.ID), data, 0644); err != nil {
		return "", err
	}
	return sq.ID, nil
}

func (a *App) DeleteQueryTab(id string) error {
	err := os.Remove(savedQueryPath(id))
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// ─── Grouping folders ────────────────────────────────────────────────────────
// A folder is just a name the user has created — connections/saved queries
// reference it by name in their own Folder field. Folder lists are stored
// separately so an empty folder (created but nothing moved into it yet) still
// persists; deleting a folder un-groups (not deletes) whatever was in it.

func connectionFoldersPath() string {
	return filepath.Join(dbDir(), "connection_folders.json")
}

func queryFoldersPath() string {
	return filepath.Join(queriesDir(), "folders.json")
}

func readFolderList(path string) []string {
	data, err := os.ReadFile(path)
	if err != nil {
		return []string{}
	}
	list := []string{}
	if err := json.Unmarshal(data, &list); err != nil {
		return []string{}
	}
	if list == nil {
		list = []string{}
	}
	return list
}

func writeFolderList(path string, list []string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	data, err := json.Marshal(list)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func addFolder(path, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("folder name cannot be empty")
	}
	list := readFolderList(path)
	for _, f := range list {
		if f == name {
			return nil // already exists, no-op
		}
	}
	return writeFolderList(path, append(list, name))
}

func removeFolder(path, name string) error {
	list := readFolderList(path)
	filtered := make([]string, 0, len(list))
	for _, f := range list {
		if f != name {
			filtered = append(filtered, f)
		}
	}
	return writeFolderList(path, filtered)
}

func (a *App) ListDBConnectionFolders() []string {
	return readFolderList(connectionFoldersPath())
}

func (a *App) CreateDBConnectionFolder(name string) error {
	return addFolder(connectionFoldersPath(), name)
}

// DeleteDBConnectionFolder removes the folder and un-groups (not deletes) any
// connection that was in it.
func (a *App) DeleteDBConnectionFolder(name string) error {
	list := readStoredConnections()
	changed := false
	for i, s := range list {
		if s.Folder == name {
			list[i].Folder = ""
			changed = true
		}
	}
	if changed {
		if err := writeStoredConnections(list); err != nil {
			return err
		}
	}
	return removeFolder(connectionFoldersPath(), name)
}

// RenameDBConnectionFolder renames a folder everywhere it's referenced. If
// newName already names a different existing folder, this merges into it
// (every connection in oldName is reassigned to newName, and oldName is
// dropped from the folder list) rather than erroring — folders are just
// names, not unique-checked entities, same as everywhere else in this file.
func (a *App) RenameDBConnectionFolder(oldName, newName string) error {
	newName = strings.TrimSpace(newName)
	if newName == "" || newName == oldName {
		return nil
	}
	list := readStoredConnections()
	changed := false
	for i, s := range list {
		if s.Folder == oldName {
			list[i].Folder = newName
			changed = true
		}
	}
	if changed {
		if err := writeStoredConnections(list); err != nil {
			return err
		}
	}
	if err := removeFolder(connectionFoldersPath(), oldName); err != nil {
		return err
	}
	return addFolder(connectionFoldersPath(), newName)
}

// MoveDBConnectionToFolder assigns (or clears, with folder="") a connection's
// group without touching any other field, including the password.
func (a *App) MoveDBConnectionToFolder(id string, folder string) error {
	list := readStoredConnections()
	found := false
	for i, s := range list {
		if s.ID == id {
			list[i].Folder = folder
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("connection %s not found", id)
	}
	return writeStoredConnections(list)
}

func (a *App) ListQueryFolders() []string {
	return readFolderList(queryFoldersPath())
}

func (a *App) CreateQueryFolder(name string) error {
	return addFolder(queryFoldersPath(), name)
}

// DeleteQueryFolder removes the folder and un-groups (not deletes) any saved
// query that was in it.
func (a *App) DeleteQueryFolder(name string) error {
	for _, sq := range a.ListSavedQueries() {
		if sq.Folder == name {
			sq.Folder = ""
			if _, err := a.SaveQueryTab(sq); err != nil {
				return err
			}
		}
	}
	return removeFolder(queryFoldersPath(), name)
}

// MoveQueryToFolder assigns (or clears, with folder="") a saved query's group.
func (a *App) MoveQueryToFolder(id string, folder string) error {
	data, err := os.ReadFile(savedQueryPath(id))
	if err != nil {
		return err
	}
	var sq SavedQuery
	if err := json.Unmarshal(data, &sq); err != nil {
		return err
	}
	sq.Folder = folder
	_, err = a.SaveQueryTab(sq)
	return err
}

// RenameQueryFolder renames a folder everywhere it's referenced, merging
// into newName if it already names a different existing folder — same
// reasoning as RenameDBConnectionFolder.
func (a *App) RenameQueryFolder(oldName, newName string) error {
	newName = strings.TrimSpace(newName)
	if newName == "" || newName == oldName {
		return nil
	}
	for _, sq := range a.ListSavedQueries() {
		if sq.Folder == oldName {
			sq.Folder = newName
			if _, err := a.SaveQueryTab(sq); err != nil {
				return err
			}
		}
	}
	if err := removeFolder(queryFoldersPath(), oldName); err != nil {
		return err
	}
	return addFolder(queryFoldersPath(), newName)
}
