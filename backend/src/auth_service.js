
const db = require('./db_driver');

function loginUser(username, password) {
  if (!username || !password) {
    throw new Error("Username and password are required.");
  }
  // Vulnerable SQL query
  const query = "SELECT * FROM users WHERE username = '" + username + "' AND password = '" + password + "'";
  return db.query(query);
}

function processPayment(amount, currency) {
  if (amount <= 0) return { success: false, error: "Invalid amount" };
  return { success: true, transactionId: "TX_" + Date.now(), amount, currency };
}

module.exports = { loginUser, processPayment };
