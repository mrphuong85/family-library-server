// Family Library Server — Node + Express, khong phu thuoc native
// Du lieu luu trong data.json tren dia (may chu la nguon su that), khong dung localStorage cho sach.
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'doi-mat-khau-nay-truoc-khi-deploy';
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) { console.error('Khong doc duoc data.json, tao moi:', e.message); }
  return { users: [], books: [], members: [], wishlist: [] };
}
function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
let db = loadData();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Chua dang nhap. Vui long dang nhap.' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Phien dang nhap het han. Vui long dang nhap lai.' }); }
}
const sign = (u) => jwt.sign({ id: u.id, username: u.username }, JWT_SECRET, { expiresIn: '30d' });
const pubUser = (u) => ({ id: u.id, username: u.username, displayName: u.displayName });

// ---------- Auth ----------
app.post('/api/auth/register', async (req, res) => {
  const { username, password, displayName } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Nhap ten dang nhap va mat khau.' });
  if (String(password).length < 4) return res.status(400).json({ error: 'Mat khau it nhat 4 ky tu.' });
  const name = String(username).trim().toLowerCase();
  if (db.users.some(u => u.username === name)) return res.status(400).json({ error: 'Ten dang nhap da co nguoi dung.' });
  const user = { id: uid(), username: name, displayName: (displayName || username).trim(), passwordHash: await bcrypt.hash(String(password), 10), createdAt: new Date().toISOString() };
  db.users.push(user); saveData();
  res.json({ token: sign(user), user: pubUser(user) });
});
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const user = db.users.find(u => u.username === String(username || '').trim().toLowerCase());
  if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) return res.status(401).json({ error: 'Ten dang nhap hoac mat khau sai.' });
  res.json({ token: sign(user), user: pubUser(user) });
});
app.get('/api/auth/me', auth, (req, res) => {
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(401).json({ error: 'Tai khoan khong ton tai.' });
  res.json({ user: pubUser(user) });
});
app.post('/api/auth/change-password', auth, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  const user = db.users.find(u => u.id === req.user.id);
  if (!user || !(await bcrypt.compare(String(oldPassword || ''), user.passwordHash))) return res.status(401).json({ error: 'Mat khau cu sai.' });
  if (!newPassword || String(newPassword).length < 4) return res.status(400).json({ error: 'Mat khau moi it nhat 4 ky tu.' });
  user.passwordHash = await bcrypt.hash(String(newPassword), 10); saveData();
  res.json({ ok: true });
});

// ---------- ISBN: Google Books truoc, Open Library du phong ----------
app.get('/api/isbn/:isbn', async (req, res) => {
  const isbn = String(req.params.isbn).replace(/[^0-9Xx]/g, '');
  if (!isbn) return res.status(400).json({ error: 'Nhap ma ISBN.' });
  try {
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    const j = await r.json();
    const info = j.items && j.items[0] && j.items[0].volumeInfo;
    if (info) return res.json({ source: 'Google Books', title: info.title || '', author: (info.authors || []).join(', '), year: info.publishedDate ? parseInt(info.publishedDate.slice(0, 4)) : null, pages: info.pageCount || null, cover: (info.imageLinks && (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail)) || '', isbn, description: info.description || '' });
  } catch (e) { console.error('Google Books loi:', e.message); }
  try {
    const r = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
    if (r.ok) {
      const j = await r.json();
      let author = '';
      if (j.authors && j.authors[0] && j.authors[0].key) {
        const a = await fetch(`https://openlibrary.org${j.authors[0].key}.json`); const aj = await a.json(); author = aj.name || '';
      }
      return res.json({ source: 'Open Library', title: j.title || '', author, year: j.publish_date ? parseInt(String(j.publish_date).slice(-4)) : null, pages: j.number_of_pages || null, cover: j.covers && j.covers[0] ? `https://covers.openlibrary.org/b/id/${j.covers[0]}-M.jpg` : '', isbn });
    }
  } catch (e) { console.error('Open Library loi:', e.message); }
  res.status(404).json({ error: 'Khong tim thay sach voi ISBN nay.' });
});

// ---------- Books (theo tai khoan) ----------
app.get('/api/books', auth, (req, res) => res.json(db.books.filter(b => b.userId === req.user.id)));
app.post('/api/books', auth, (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'Nhap tieu de sach.' });
  const book = { id: uid(), userId: req.user.id, title: b.title, author: b.author || '', genre: b.genre || '', year: b.year || null, pages: b.pages || null, isbn: b.isbn || '', cover: b.cover || '', location: b.location || '', status: ['ready','reading','lent','lost'].includes(b.status) ? b.status : 'ready', reader: b.reader || '', progress: Math.max(0, Math.min(100, Number(b.progress) || 0)), rating: Math.max(0, Math.min(5, Number(b.rating) || 0)), review: b.review || '', createdAt: new Date().toISOString() };
  db.books.push(book); saveData(); res.status(201).json(book);
});
app.put('/api/books/:id', auth, (req, res) => {
  const book = db.books.find(b => b.id === req.params.id && b.userId === req.user.id);
  if (!book) return res.status(404).json({ error: 'Khong tim thay sach.' });
  Object.assign(book, req.body, { id: book.id, userId: book.userId });
  if (book.progress != null) book.progress = Math.max(0, Math.min(100, Number(book.progress) || 0));
  saveData(); res.json(book);
});
app.delete('/api/books/:id', auth, (req, res) => {
  const i = db.books.findIndex(b => b.id === req.params.id && b.userId === req.user.id);
  if (i < 0) return res.status(404).json({ error: 'Khong tim thay sach.' });
  db.books.splice(i, 1); saveData(); res.json({ ok: true });
});

// ---------- Members ----------
app.get('/api/members', auth, (req, res) => res.json(db.members.filter(m => m.userId === req.user.id)));
app.post('/api/members', auth, (req, res) => {
  const { name, avatar, color } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nhap ten thanh vien.' });
  const m = { id: uid(), userId: req.user.id, name, avatar: avatar || '📚', color: color || '#c97b4a' };
  db.members.push(m); saveData(); res.status(201).json(m);
});
app.delete('/api/members/:id', auth, (req, res) => {
  const i = db.members.findIndex(m => m.id === req.params.id && m.userId === req.user.id);
  if (i < 0) return res.status(404).json({ error: 'Khong tim thay thanh vien.' });
  db.members.splice(i, 1); saveData(); res.json({ ok: true });
});

// ---------- Wishlist ----------
app.get('/api/wishlist', auth, (req, res) => res.json(db.wishlist.filter(w => w.userId === req.user.id)));
app.post('/api/wishlist', auth, (req, res) => {
  const { title, author, note } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Nhap tieu de sach muon mua.' });
  const w = { id: uid(), userId: req.user.id, title, author: author || '', note: note || '' };
  db.wishlist.push(w); saveData(); res.status(201).json(w);
});
app.post('/api/wishlist/:id/buy', auth, (req, res) => {
  const i = db.wishlist.findIndex(w => w.id === req.params.id && w.userId === req.user.id);
  if (i < 0) return res.status(404).json({ error: 'Khong tim thay.' });
  const w = db.wishlist.splice(i, 1)[0];
  const book = { id: uid(), userId: req.user.id, title: w.title, author: w.author, genre: '', year: null, pages: null, isbn: '', cover: '', location: '', status: 'ready', reader: '', progress: 0, rating: 0, review: '', createdAt: new Date().toISOString() };
  db.books.push(book); saveData(); res.json(book);
});
app.delete('/api/wishlist/:id', auth, (req, res) => {
  const i = db.wishlist.findIndex(w => w.id === req.params.id && w.userId === req.user.id);
  if (i < 0) return res.status(404).json({ error: 'Khong tim thay.' });
  db.wishlist.splice(i, 1); saveData(); res.json({ ok: true });
});

// ---------- Export / Import ----------
app.get('/api/export', auth, (req, res) => {
  res.json({ books: db.books.filter(b => b.userId === req.user.id), members: db.members.filter(m => m.userId === req.user.id), wishlist: db.wishlist.filter(w => w.userId === req.user.id), exportedAt: new Date().toISOString() });
});
app.post('/api/import', auth, (req, res) => {
  const { books = [], members = [], wishlist = [], mode = 'merge' } = req.body || {};
  const clean = (arr) => (Array.isArray(arr) ? arr : []).map(x => ({ ...x, id: uid(), userId: req.user.id }));
  if (mode === 'replace') {
    db.books = db.books.filter(b => b.userId !== req.user.id).concat(clean(books));
    db.members = db.members.filter(m => m.userId !== req.user.id).concat(clean(members));
    db.wishlist = db.wishlist.filter(w => w.userId !== req.user.id).concat(clean(wishlist));
  } else {
    db.books.push(...clean(books)); db.members.push(...clean(members)); db.wishlist.push(...clean(wishlist));
  }
  saveData(); res.json({ ok: true, books: db.books.filter(b => b.userId === req.user.id).length });
});

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Thu vien Sach Gia dinh chay tai http://localhost:${PORT}`));
