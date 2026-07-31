
function query(sqlString) {
  return { rows: [{ id: 1, name: 'admin' }], sql: sqlString };
}
module.exports = { query };
