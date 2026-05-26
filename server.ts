import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Phase 1: Database Initialization ---
// This creates a file named 'intelligence.db' in your project folder.
// All your news data will be stored here safely.
const db = new Database('intelligence.db');

// Create the tables for our intelligence system
db.exec(`
  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER REFERENCES categories(id),
    category TEXT, -- Legacy support
    type TEXT DEFAULT 'raw', -- 'raw' or 'refined'
    parent_id INTEGER REFERENCES news(id),
    raw_text TEXT NOT NULL,
    summary_en TEXT,
    summary_hi TEXT,
    is_copied INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER REFERENCES categories(id),
    category TEXT, -- Legacy support
    type TEXT NOT NULL, -- daily, weekly, quarterly, yearly
    source_news_ids TEXT, -- JSON array of news IDs
    source_mode TEXT, -- raw, refined, master
    content_en TEXT NOT NULL,
    content_hi TEXT NOT NULL,
    is_copied INTEGER DEFAULT 0,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_deleted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER REFERENCES categories(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, parent_id)
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    api_key TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'available', -- 'available', 'exhausted', 'invalid'
    usage_count INTEGER DEFAULT 0,
    last_used_at DATETIME,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS prompt_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE,
    instruction TEXT,
    label TEXT
  );

  CREATE TABLE IF NOT EXISTS custom_refinements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instruction TEXT NOT NULL UNIQUE,
    elaborated_prompt TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migration: Add is_deleted column if it doesn't exist (for existing databases)
try {
  const newsInfo = db.prepare("PRAGMA table_info(news)").all() as any[];
  if (!newsInfo.some(col => col.name === 'is_deleted')) {
    console.log('Migrating news table: adding is_deleted column');
    db.exec("ALTER TABLE news ADD COLUMN is_deleted INTEGER DEFAULT 0");
  }
  if (!newsInfo.some(col => col.name === 'type')) {
    console.log('Migrating news table: adding type column');
    db.exec("ALTER TABLE news ADD COLUMN type TEXT DEFAULT 'raw'");
  }
  if (!newsInfo.some(col => col.name === 'parent_id')) {
    console.log('Migrating news table: adding parent_id column');
    db.exec("ALTER TABLE news ADD COLUMN parent_id INTEGER REFERENCES news(id)");
  }
  if (!newsInfo.some(col => col.name === 'category_id')) {
    console.log('Migrating news table: adding category_id column');
    db.exec("ALTER TABLE news ADD COLUMN category_id INTEGER REFERENCES categories(id)");
  }
  if (!newsInfo.some(col => col.name === 'is_copied')) {
    console.log('Migrating news table: adding is_copied column');
    db.exec("ALTER TABLE news ADD COLUMN is_copied INTEGER DEFAULT 0");
  }

  const reportsInfo = db.prepare("PRAGMA table_info(reports)").all() as any[];
  if (!reportsInfo.some(col => col.name === 'is_deleted')) {
    console.log('Migrating reports table: adding is_deleted column');
    db.exec("ALTER TABLE reports ADD COLUMN is_deleted INTEGER DEFAULT 0");
  }
  if (!reportsInfo.some(col => col.name === 'source_news_ids')) {
    console.log('Migrating reports table: adding source_news_ids column');
    db.exec("ALTER TABLE reports ADD COLUMN source_news_ids TEXT");
  }
  if (!reportsInfo.some(col => col.name === 'source_mode')) {
    console.log('Migrating reports table: adding source_mode column');
    db.exec("ALTER TABLE reports ADD COLUMN source_mode TEXT");
  }
  if (!reportsInfo.some(col => col.name === 'category_id')) {
    console.log('Migrating reports table: adding category_id column');
    db.exec("ALTER TABLE reports ADD COLUMN category_id INTEGER REFERENCES categories(id)");
  }
  if (!reportsInfo.some(col => col.name === 'is_copied')) {
    console.log('Migrating reports table: adding is_copied column');
    db.exec("ALTER TABLE reports ADD COLUMN is_copied INTEGER DEFAULT 0");
  }

  const categoriesInfo = db.prepare("PRAGMA table_info(categories)").all() as any[];
  if (!categoriesInfo.some(col => col.name === 'parent_id')) {
    console.log('Migrating categories table: adding parent_id column');
    db.exec("ALTER TABLE categories ADD COLUMN parent_id INTEGER REFERENCES categories(id)");
  }
  if (!categoriesInfo.some(col => col.name === 'header_text')) {
    console.log('Migrating categories table: adding header_text column');
    db.exec("ALTER TABLE categories ADD COLUMN header_text TEXT");
  }
  if (!categoriesInfo.some(col => col.name === 'footer_text')) {
    console.log('Migrating categories table: adding footer_text column');
    db.exec("ALTER TABLE categories ADD COLUMN footer_text TEXT");
  }
  if (!categoriesInfo.some(col => col.name === 'is_header_active')) {
    console.log('Migrating categories table: adding is_header_active column');
    db.exec("ALTER TABLE categories ADD COLUMN is_header_active INTEGER DEFAULT 0");
  }
  if (!categoriesInfo.some(col => col.name === 'is_footer_active')) {
    console.log('Migrating categories table: adding is_footer_active column');
    db.exec("ALTER TABLE categories ADD COLUMN is_footer_active INTEGER DEFAULT 0");
  }

  const refinementsInfo = db.prepare("PRAGMA table_info(custom_refinements)").all() as any[];
  if (!refinementsInfo.some(col => col.name === 'elaborated_prompt')) {
    console.log('Migrating custom_refinements table: adding elaborated_prompt column');
    db.exec("ALTER TABLE custom_refinements ADD COLUMN elaborated_prompt TEXT");
  }

  // Reset exhausted keys at midnight
  const resetExhaustedKeys = () => {
    try {
      const stmt = db.prepare(`
        UPDATE api_keys 
        SET status = 'available', usage_count = 0 
        WHERE status = 'exhausted' AND date(last_used_at) < date('now', 'localtime')
      `);
      const info = stmt.run();
      if (info.changes > 0) {
        console.log(`Reset ${info.changes} exhausted API keys for the new day.`);
      }
    } catch (e) {
      console.error('Failed to reset exhausted keys:', e);
    }
  };
  resetExhaustedKeys();

} catch (e) {
  console.error('Migration failed:', e);
}

// Seed initial categories if empty
const categoryCount = db.prepare('SELECT count(*) as count FROM categories').get() as { count: number };
if (categoryCount.count === 0) {
  const insert = db.prepare('INSERT INTO categories (name) VALUES (?)');
  ['Metal', 'Cotton', 'Oil'].forEach(name => insert.run(name));
}

// Seed initial prompt templates
const insertPrompt = db.prepare('INSERT OR IGNORE INTO prompt_templates (key, instruction, label) VALUES (?, ?, ?)');
insertPrompt.run('headline_format', '- Include a professional headline. Format the headline in **Bold** and ensure there are exactly two blank lines (linebreaks) between the headline and the body content.', 'Headline Format');
insertPrompt.run('lang_en', 'Provide English only.', 'Language: English');
insertPrompt.run('lang_hi', 'Provide Hindi only. You MUST output native, grammatically correct Devanagari script. DO NOT output hallucinated gibberish or broken characters.', 'Language: Hindi');
insertPrompt.run('lang_both', 'Provide both English and Hindi. For Hindi, you MUST output native, grammatically correct Devanagari script. DO NOT output hallucinated gibberish or broken characters.', 'Language: Both');
insertPrompt.run('format_paragraph', 'Write as a cohesive paragraph.', 'Format: Paragraph');
insertPrompt.run('format_bullets', 'OUTPUT STRICTLY AS A BULLETED LIST. Every single point MUST begin with a dash (-). Absolutely NO paragraphs.', 'Format: Bullets');
insertPrompt.run('length_short', 'Very short and concise.', 'Length: Very Short');
insertPrompt.run('length_medium', 'Medium length, balanced detail.', 'Length: Medium');
insertPrompt.run('length_long', 'Normal length, comprehensive.', 'Length: Normal');
insertPrompt.run('addon_sentiment', '- Analyze market sentiment (Bullish/Bearish/Neutral) and provide a brief reason.', 'Add-on: Sentiment');
insertPrompt.run('addon_figures', '- Extract and list all key prices, percentages, and figures mentioned.', 'Add-on: Key Figures');
insertPrompt.run('addon_impact', '- Add an "Impact Analysis" section explaining why this news matters for the market.', 'Add-on: Impact Analysis');
insertPrompt.run('addon_tags', '- Generate 3-5 relevant search tags/hashtags.', 'Add-on: Search Tags');

// Seed initial custom refinement instructions if empty
try {
  const refinementCount = db.prepare('SELECT count(*) as count FROM custom_refinements').get() as { count: number };
  if (refinementCount.count === 0) {
    const insertRefinement = db.prepare('INSERT OR IGNORE INTO custom_refinements (instruction) VALUES (?)');
    [
      'Make it punchy and short',
      'Focus on price levels and key resist/support figures',
      'Summarize key global and domestic events only'
    ].forEach(instr => insertRefinement.run(instr));
    console.log('Seeded initial custom refinements.');
  }
} catch (e) {
  console.error('Failed to seed custom refinements:', e);
}

console.log('✅ SQLite Database initialized: intelligence.db');

async function startServer() {
  const app = express();
  // AI Studio requires port 3000, but you can override this locally using LOCAL_PORT in your .env
  const PORT = process.env.LOCAL_PORT || 3000;

  app.use(express.json());

  // --- API Routes ---
  
  // --- API Keys Routes ---

  app.get('/api/keys', (req, res) => {
    try {
      const stmt = db.prepare('SELECT id, name, api_key, status, usage_count, last_used_at, is_active, sort_order, created_at FROM api_keys ORDER BY sort_order ASC, id ASC');
      const keys = stmt.all();
      res.json(keys);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch API keys' });
    }
  });

  app.post('/api/keys', (req, res) => {
    const { name, api_key } = req.body;
    if (!name || !api_key) return res.status(400).json({ error: 'Name and API Key are required' });
    try {
      // Get max sort_order
      const maxOrderRow = db.prepare('SELECT MAX(sort_order) as maxOrder FROM api_keys').get() as { maxOrder: number | null };
      const nextOrder = (maxOrderRow.maxOrder || 0) + 1;

      const stmt = db.prepare('INSERT INTO api_keys (name, api_key, sort_order) VALUES (?, ?, ?)');
      const info = stmt.run(name, api_key, nextOrder);
      res.json({ id: info.lastInsertRowid, status: 'created' });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(400).json({ error: 'This API key already exists' });
      }
      res.status(500).json({ error: 'Failed to add API key' });
    }
  });

  app.patch('/api/keys/:id', (req, res) => {
    const { id } = req.params;
    const { is_active, status, usage_count, last_used_at, sort_order } = req.body;
    
    try {
      const updates: string[] = [];
      const values: any[] = [];
      
      if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
      if (status !== undefined) { updates.push('status = ?'); values.push(status); }
      if (usage_count !== undefined) { updates.push('usage_count = ?'); values.push(usage_count); }
      if (last_used_at !== undefined) { updates.push('last_used_at = ?'); values.push(last_used_at); }
      if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(sort_order); }
      
      if (updates.length === 0) return res.json({ status: 'no changes' });
      
      values.push(id);
      const stmt = db.prepare(`UPDATE api_keys SET ${updates.join(', ')} WHERE id = ?`);
      stmt.run(...values);
      res.json({ status: 'updated' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update API key' });
    }
  });

  app.delete('/api/keys/:id', (req, res) => {
    const { id } = req.params;
    try {
      const stmt = db.prepare('DELETE FROM api_keys WHERE id = ?');
      stmt.run(id);
      res.json({ status: 'deleted' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete API key' });
    }
  });

  // Reorder keys
  app.post('/api/keys/reorder', (req, res) => {
    const { orderedIds } = req.body; // Array of IDs in new order
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds must be an array' });
    
    try {
      const stmt = db.prepare('UPDATE api_keys SET sort_order = ? WHERE id = ?');
      const transaction = db.transaction((ids: number[]) => {
        ids.forEach((id, index) => {
          stmt.run(index, id);
        });
      });
      transaction(orderedIds);
      res.json({ status: 'reordered' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to reorder API keys' });
    }
  });

  // --- End API Keys Routes ---

  // Get all categories
  app.get('/api/categories', (req, res) => {
    try {
      const stmt = db.prepare('SELECT * FROM categories ORDER BY id ASC');
      const categories = stmt.all();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch categories' });
    }
  });

  // Create a new category
  app.post('/api/categories', (req, res) => {
    const { name, parent_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    try {
      const stmt = db.prepare('INSERT INTO categories (name, parent_id) VALUES (?, ?)');
      const info = stmt.run(name, parent_id || null);
      res.json({ id: info.lastInsertRowid, name, parent_id: parent_id || null, status: 'created' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create category (maybe it already exists in this section?)' });
    }
  });

  // Edit an existing category
  app.patch('/api/categories/:id', (req, res) => {
    const id = req.params.id;
    const { name, header_text, footer_text, is_header_active, is_footer_active } = req.body;
    
    try {
      const updates: string[] = [];
      const values: any[] = [];
      
      if (name !== undefined) { updates.push('name = ?'); values.push(name); }
      if (header_text !== undefined) { updates.push('header_text = ?'); values.push(header_text); }
      if (footer_text !== undefined) { updates.push('footer_text = ?'); values.push(footer_text); }
      if (is_header_active !== undefined) { updates.push('is_header_active = ?'); values.push(is_header_active ? 1 : 0); }
      if (is_footer_active !== undefined) { updates.push('is_footer_active = ?'); values.push(is_footer_active ? 1 : 0); }
      
      if (updates.length === 0) return res.json({ status: 'no changes' });
      
      values.push(id);
      console.log(`Updating category id ${id} with:`, { name, header_text, footer_text, is_header_active, is_footer_active });
      const stmt = db.prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`);
      const result = stmt.run(...values);
      console.log(`Category update result for id ${id}:`, result);
      
      res.json({ id: Number(id), status: 'updated' });
    } catch (error: any) {
      console.error('Failed to update category in database:', error);
      res.status(500).json({ error: 'Failed to update category', details: error?.message || String(error) });
    }
  });

  // Get multiple categories
  app.get('/api/news/multi', (req, res) => {
    const idsString = req.query.ids as string;
    if (!idsString) return res.json([]);
    const ids = idsString.split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n));
    if (ids.length === 0) return res.json([]);
    
    // SQLite limits parameters, but practically it's fine for small lists
    const placeholders = ids.map(() => '?').join(',');
    const stmt = db.prepare(`SELECT * FROM news WHERE category_id IN (${placeholders}) AND is_deleted = 0 ORDER BY created_at DESC`);
    const news = stmt.all(...ids);
    res.json(news);
  });

  // Get all news for a specific category ID
  app.get('/api/news/:categoryId', (req, res) => {
    const { categoryId } = req.params;
    const stmt = db.prepare('SELECT * FROM news WHERE category_id = ? AND is_deleted = 0 ORDER BY created_at DESC');
    const news = stmt.all(categoryId);
    res.json(news);
  });

  // Save new news (raw or refined)
  app.post('/api/news', (req, res) => {
    const { category_id, category_name, raw_text, type, parent_id, summary_en, summary_hi, created_at } = req.body;
    if (!category_id || !raw_text) {
      return res.status(400).json({ error: 'category_id and raw_text are required' });
    }
    try {
      const stmt = db.prepare(`
        INSERT INTO news (category_id, category, raw_text, type, parent_id, summary_en, summary_hi, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
      `);
      const info = stmt.run(
        category_id, 
        category_name || 'Unknown', 
        raw_text, 
        type || 'raw', 
        parent_id || null,
        summary_en || null,
        summary_hi || null,
        created_at || null
      );
      res.json({ id: info.lastInsertRowid, status: 'saved' });
    } catch (error) {
      console.error('Failed to save news:', error);
      res.status(500).json({ error: 'Failed to save news' });
    }
  });

  // Update news with summary and translation
  app.patch('/api/news/:id', (req, res) => {
    const { id } = req.params;
    const { summary_en, summary_hi, is_copied } = req.body;
    
    if (is_copied !== undefined) {
      const stmt = db.prepare('UPDATE news SET is_copied = ? WHERE id = ?');
      stmt.run(is_copied ? 1 : 0, id);
      return res.json({ status: 'updated_copied_status' });
    }

    const stmt = db.prepare('UPDATE news SET summary_en = ?, summary_hi = ? WHERE id = ?');
    stmt.run(summary_en, summary_hi, id);
    res.json({ status: 'updated' });
  });

  // Update report copied status
  app.patch('/api/reports/:id/copied', (req, res) => {
    const { id } = req.params;
    const { is_copied } = req.body;
    try {
      const stmt = db.prepare('UPDATE reports SET is_copied = ? WHERE id = ?');
      stmt.run(is_copied ? 1 : 0, id);
      res.json({ status: 'updated_copied_status' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update report copied status' });
    }
  });

  // Get news for a category ID within a specific time period
  app.get('/api/news/:categoryId/period/:period', (req, res) => {
    const { categoryId, period } = req.params;
    let dateFilter = "date(created_at) = date('now')"; // default daily
    
    if (period === 'weekly') {
      dateFilter = "created_at >= date('now', '-7 days')";
    } else if (period === 'monthly' || period === 'quarterly') {
      dateFilter = "created_at >= date('now', '-30 days')";
    } else if (period === 'yearly') {
      dateFilter = "created_at >= date('now', '-1 year')";
    }

    try {
      const stmt = db.prepare(`SELECT * FROM news WHERE category_id = ? AND is_deleted = 0 AND ${dateFilter} ORDER BY created_at ASC`);
      const news = stmt.all(categoryId);
      res.json(news);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch news for period" });
    }
  });

  // Save a new report
  app.post('/api/reports', (req, res) => {
    const { category_id, category_name, type, content_en, content_hi, start_date, end_date, source_news_ids, source_mode } = req.body;
    try {
      const stmt = db.prepare(`
        INSERT INTO reports (category_id, category, type, content_en, content_hi, start_date, end_date, source_news_ids, source_mode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const info = stmt.run(
        category_id, 
        category_name || 'Unknown', 
        type, 
        content_en, 
        content_hi, 
        start_date, 
        end_date,
        source_news_ids ? JSON.stringify(source_news_ids) : null,
        source_mode || null
      );
      res.json({ id: info.lastInsertRowid, status: 'saved' });
    } catch (error) {
      console.error('Failed to save report:', error);
      res.status(500).json({ error: "Failed to save report" });
    }
  });

  // Get all reports for multiple categories
  app.get('/api/reports/multi', (req, res) => {
    const idsString = req.query.ids as string;
    if (!idsString) return res.json([]);
    const ids = idsString.split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n));
    if (ids.length === 0) return res.json([]);
    
    // SQLite limits parameters, but practically it's fine for small lists
    const placeholders = ids.map(() => '?').join(',');
    const stmt = db.prepare(`SELECT * FROM reports WHERE category_id IN (${placeholders}) AND is_deleted = 0 ORDER BY created_at DESC`);
    const reports = stmt.all(...ids);
    res.json(reports);
  });

  // Get all reports for a category ID
  app.get('/api/reports/:categoryId', (req, res) => {
    const { categoryId } = req.params;
    try {
      const stmt = db.prepare('SELECT * FROM reports WHERE category_id = ? AND is_deleted = 0 ORDER BY created_at DESC');
      const reports = stmt.all(categoryId);
      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  // --- Trash Management ---

  // Get deleted items (Trash) - supports optional category filter
  app.get('/api/trash', (req, res) => {
    const { category_id } = req.query;
    try {
      let newsQuery = "SELECT *, 'news' as item_type FROM news WHERE is_deleted = 1";
      let reportsQuery = "SELECT *, 'report' as item_type FROM reports WHERE is_deleted = 1";
      const params: any[] = [];

      if (category_id) {
        newsQuery += ' AND category_id = ?';
        reportsQuery += ' AND category_id = ?';
        params.push(category_id);
      }

      newsQuery += ' ORDER BY created_at DESC';
      reportsQuery += ' ORDER BY created_at DESC';

      const news = db.prepare(newsQuery).all(...params);
      const reports = db.prepare(reportsQuery).all(...params);
      
      console.log(`Fetched trash for category_id: ${category_id || 'ALL'}. Found ${news.length} news, ${reports.length} reports.`);
      res.json({ news, reports });
    } catch (error) {
      console.error('Failed to fetch trash:', error);
      res.status(500).json({ error: 'Failed to fetch trash' });
    }
  });

  // Soft delete news (and its children)
  app.patch('/api/news/:id/trash', (req, res) => {
    const { id } = req.params;
    try {
      // Move the item itself
      const result = db.prepare('UPDATE news SET is_deleted = 1 WHERE id = ?').run(id);
      // Also move any refined children
      db.prepare('UPDATE news SET is_deleted = 1 WHERE parent_id = ?').run(id);
      
      console.log(`Moved news ${id} and its children to trash.`);
      res.json({ status: 'moved_to_trash', changes: result.changes });
    } catch (error) {
      console.error(`Failed to move news ${id} to trash:`, error);
      res.status(500).json({ error: 'Failed to move news to trash' });
    }
  });

  // Soft delete report
  app.patch('/api/reports/:id/trash', (req, res) => {
    const { id } = req.params;
    try {
      const result = db.prepare('UPDATE reports SET is_deleted = 1 WHERE id = ?').run(id);
      console.log(`Moved report ${id} to trash. Rows affected: ${result.changes}`);
      res.json({ status: 'moved_to_trash', changes: result.changes });
    } catch (error) {
      console.error(`Failed to move report ${id} to trash:`, error);
      res.status(500).json({ error: 'Failed to move report to trash' });
    }
  });

  // Restore news (and its children)
  app.patch('/api/news/:id/restore', (req, res) => {
    const { id } = req.params;
    try {
      db.prepare('UPDATE news SET is_deleted = 0 WHERE id = ?').run(id);
      db.prepare('UPDATE news SET is_deleted = 0 WHERE parent_id = ?').run(id);
      res.json({ status: 'restored' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to restore news' });
    }
  });

  // Restore report
  app.patch('/api/reports/:id/restore', (req, res) => {
    const { id } = req.params;
    db.prepare('UPDATE reports SET is_deleted = 0 WHERE id = ?').run(id);
    res.json({ status: 'restored' });
  });

  // Permanently delete news
  app.delete('/api/news/:id', (req, res) => {
    const { id } = req.params;
    db.prepare('DELETE FROM news WHERE id = ?').run(id);
    res.json({ status: 'permanently_deleted' });
  });

  // Permanently delete report
  app.delete('/api/reports/:id', (req, res) => {
    const { id } = req.params;
    db.prepare('DELETE FROM reports WHERE id = ?').run(id);
    res.json({ status: 'permanently_deleted' });
  });

  // Prompt Templates Endpoints
  app.get('/api/prompts', (req, res) => {
    const prompts = db.prepare('SELECT * FROM prompt_templates').all();
    res.json(prompts);
  });

  app.patch('/api/prompts/:key', (req, res) => {
    const { instruction } = req.body;
    try {
      db.prepare('UPDATE prompt_templates SET instruction = ? WHERE key = ?').run(instruction, req.params.key);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Custom Refinement Instructions Endpoints ---
  app.get('/api/custom-refinements', (req, res) => {
    try {
      const refinements = db.prepare('SELECT * FROM custom_refinements ORDER BY id DESC').all();
      res.json(refinements);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch custom refinements', details: error.message });
    }
  });

  app.post('/api/custom-refinements', (req, res) => {
    const { instruction, elaborated_prompt } = req.body;
    if (!instruction || !instruction.trim()) {
      return res.status(400).json({ error: 'Instruction text is required' });
    }
    try {
      const stmt = db.prepare('INSERT INTO custom_refinements (instruction, elaborated_prompt) VALUES (?, ?)');
      const info = stmt.run(instruction.trim(), elaborated_prompt ? elaborated_prompt.trim() : null);
      res.json({ 
        id: info.lastInsertRowid, 
        instruction: instruction.trim(), 
        elaborated_prompt: elaborated_prompt ? elaborated_prompt.trim() : null, 
        status: 'created' 
      });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(400).json({ error: 'This custom instruction already exists' });
      }
      res.status(500).json({ error: 'Failed to create custom refinement', details: error.message });
    }
  });

  app.put('/api/custom-refinements/:id', (req, res) => {
    const { id } = req.params;
    const { instruction, elaborated_prompt } = req.body;
    
    // Allow updating instruction, elaborated_prompt, or both. At least one is required.
    if ((instruction === undefined || instruction === null || !instruction.trim()) && (elaborated_prompt === undefined)) {
      return res.status(400).json({ error: 'At least instruction or elaborated_prompt is required' });
    }

    try {
      if (instruction !== undefined && elaborated_prompt !== undefined) {
        db.prepare('UPDATE custom_refinements SET instruction = ?, elaborated_prompt = ? WHERE id = ?').run(
          instruction.trim(), 
          elaborated_prompt ? elaborated_prompt.trim() : null, 
          id
        );
      } else if (instruction !== undefined) {
        db.prepare('UPDATE custom_refinements SET instruction = ? WHERE id = ?').run(instruction.trim(), id);
      } else if (elaborated_prompt !== undefined) {
        db.prepare('UPDATE custom_refinements SET elaborated_prompt = ? WHERE id = ?').run(
          elaborated_prompt ? elaborated_prompt.trim() : null, 
          id
        );
      }
      
      const updatedRow = db.prepare('SELECT * FROM custom_refinements WHERE id = ?').get(id) as any;
      res.json({ id: Number(id), ...updatedRow, status: 'updated' });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(400).json({ error: 'This custom instruction already exists' });
      }
      res.status(500).json({ error: 'Failed to update custom refinement', details: error.message });
    }
  });

  app.delete('/api/custom-refinements/:id', (req, res) => {
    const { id } = req.params;
    try {
      db.prepare('DELETE FROM custom_refinements WHERE id = ?').run(id);
      res.json({ id: Number(id), status: 'deleted' });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete custom refinement', details: error.message });
    }
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

startServer();
