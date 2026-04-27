const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db.sqlite');

db.run(`UPDATE "users" SET role = 'admin' WHERE email = 'dr393462@gmail.com'`, function(err) {
  if (err) {
    return console.error('Error:', err.message);
  }
  if (this.changes > 0) {
    console.log(`Success! Updated ${this.changes} user(s). You are now an admin.`);
  } else {
    console.log('User not found. Are you sure you logged in with that email?');
  }
  db.close();
});
