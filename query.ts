import Database from 'better-sqlite3';
const db = new Database('intelligence.db');
console.log(db.prepare('SELECT * FROM categories').all());
