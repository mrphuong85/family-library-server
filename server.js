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

// Chuan hoa tieng Viet ve dang NFC (ky tu ghep san: ế, ể, ộ...).
// Bo go tieng Viet doi khi gui len dang tach dau (chu cai + dau rieng le, vd e + dau mu + dau sac);
// neu luu nguyen vay, mot so font hien thi dau bi lech, trong nhu bi cach chu.
// NFC gom lai thanh 1 ky tu duy nhat truoc khi luu va khi doc du lieu cu.
const nfc = s => typeof s === 'string' ? s.normalize('NFC') : s;
const cleanStr = s => nfc(String(s == null ? '' : s)).trim();
const nfcDeep = v => { if (typeof v === 'string') return v.normalize('NFC'); if (Array.isArray(v)) return v.map(nfcDeep); if (v && typeof v === 'object') { for (const k of Object.keys(v)) v[k] = nfcDeep(v[k]); } return v; };

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return nfcDeep(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
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
  const user = { id: uid(), username: name, displayName: cleanStr(displayName || username), passwordHash: await bcrypt.hash(String(password), 10), createdAt: new Date().toISOString() };
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
// Thu tuu: Google Books -> Open Library /isbn/ -> Open Library bibkeys (nguon nay tra ca ten tac gia).
// Ly do: Google Books khong khoa API hay bi gioi han luot tra trong ngay (loi 429),
// con /isbn/ cua Open Library doi khi tra ve rong. Them ca doi ISBN-10 <-> ISBN-13
// vi sach cu thuong chi in ISBN-10 ma kho du lieu lai luu ISBN-13 (va nguoc lai).
function isbn10to13(i10){
  if(!/^\d{9}[\dXx]$/.test(i10)) return null;
  const body='978'+i10.slice(0,9);
  let sum=0; for(let i=0;i<12;i++) sum+= +body[i]*(i%2===0?1:3);
  return body+((10-(sum%10))%10);
}
function isbn13to10(i13){
  if(!/^978\d{9}\d$/.test(i13)) return null;
  const body=i13.slice(3,12);
  let sum=0; for(let i=0;i<9;i++) sum+= +body[i]*(10-i);
  const c=(11-(sum%11))%11;
  return body+(c===10?'X':String(c));
}
app.get('/api/isbn/:isbn', async (req, res) => {
  const raw = String(req.params.isbn).replace(/[^0-9Xx]/g, '');
  if (!raw) return res.status(400).json({ error: 'Nhap ma ISBN.' });
  const alt = raw.length === 10 ? isbn10to13(raw) : raw.length === 13 ? isbn13to10(raw) : null;
  const candidates = alt && alt !== raw ? [raw, alt] : [raw];
  const yearOf = (s) => { if (!s) return null; const m = String(s).match(/\d{4}/); return m ? parseInt(m[0]) : null; };
  // Moi nguon chi doi toi da 8 giay: neu mot nguon treo thi chuyen sang nguon du phong,
  // tranh truong hop app hien 'Dang tra cuu…' mai khong xong.
  const fetchJson = async (url) => { const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'FamilyLibrary/1.0' } }); return r; };
  for (const isbn of candidates) {
    try {
      const r = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
      const j = await r.json();
      const info = j.items && j.items[0] && j.items[0].volumeInfo;
      if (info && info.title) return res.json({ source: 'Google Books', title: info.title || '', author: (info.authors || []).join(', '), year: info.publishedDate ? parseInt(info.publishedDate.slice(0, 4)) : null, pages: info.pageCount || null, cover: (info.imageLinks && (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail)) || '', isbn, description: info.description || '' });
    } catch (e) { console.error('Google Books loi:', e.message); }
    try {
      const r = await fetchJson(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
      if (r.ok) {
        const j = await r.json();
        const b = j['ISBN:' + isbn];
        if (b && b.title) {
          return res.json({ source: 'Open Library', title: b.title || '', author: (b.authors || []).map(a => a.name).filter(Boolean).join(', '), year: yearOf(b.publish_date), pages: b.number_of_pages || null, cover: (b.cover && (b.cover.large || b.cover.medium || b.cover.small)) || '', isbn });
        }
      }
    } catch (e) { console.error('Open Library bibkeys loi:', e.message); }
    try {
      const r = await fetchJson(`https://openlibrary.org/isbn/${isbn}.json`);
      if (r.ok) {
        const j = await r.json();
        if (j.title) {
          let author = '';
          if (j.authors && j.authors[0] && j.authors[0].key) {
            try { const a = await fetchJson(`https://openlibrary.org${j.authors[0].key}.json`); const aj = await a.json(); author = aj.name || ''; } catch (e) {}
          }
          return res.json({ source: 'Open Library', title: j.title || '', author, year: yearOf(j.publish_date), pages: j.number_of_pages || null, cover: j.covers && j.covers[0] ? `https://covers.openlibrary.org/b/id/${j.covers[0]}-M.jpg` : '', isbn });
        }
      }
    } catch (e) { console.error('Open Library loi:', e.message); }
  }
  res.status(404).json({ error: 'Khong tim thay sach voi ISBN nay tren Google Books va Open Library. Ban nhap tay ten sach, tac gia roi bam Them vao ke nhe.' });
});

// ---------- Tim sach theo ten: Tiki (sach Viet) + Open Library ----------
// ISBN tra khong ra thi tim theo ten: nhieu sach Viet co tren Tiki / Open Library theo ten
// du ISBN cua an ban Viet Nam khong co trong kho quoc te.
app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Nhap ten sach can tim.' });
  const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' };
  const fetchJson = async (url, headers) => { const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: headers || { 'User-Agent': 'FamilyLibrary/1.0' } }); return r; };
  const results = [];
  const push = (b) => { if (b && b.title) results.push({ title: nfc(String(b.title)), author: nfc(String(b.author || '')), year: b.year || null, pages: b.pages || null, cover: b.cover || '', isbn: b.isbn || '', price: b.price || null, source: b.source || '' }); };
  // Tiki truoc: kho sach Viet, co ten/tac gia/nam/trang/bia/gia.
  try {
    const r = await fetchJson('https://tiki.vn/api/v2/products?q=' + encodeURIComponent(q) + '&limit=5', UA);
    const j = await r.json();
    const items = (j.data || []).slice(0, 5);
    const details = await Promise.allSettled(items.map(it => fetchJson('https://tiki.vn/api/v2/products/' + it.id, UA).then(x => x.json())));
    items.forEach((it, idx) => {
      const d = details[idx].status === 'fulfilled' ? details[idx].value : null;
      const spec = {};
      ((d && d.specifications) || []).forEach(s => (s.attributes || []).forEach(a => { spec[a.name] = a.value; }));
      const year = spec['Ngày xuất bản'] ? parseInt(String(spec['Ngày xuất bản']).slice(0, 4)) : null;
      const pages = spec['Số trang'] ? parseInt(String(spec['Số trang']).replace(/[^0-9]/g, '')) || null : null;
      push({ title: (d && d.name) || it.name, author: (d && d.authors && d.authors[0] && d.authors[0].name) || '', year, pages, cover: (d && d.thumbnail_url) || it.thumbnail_url || '', isbn: spec['ISBN'] || spec['Mã ISBN'] || '', price: it.price || null, source: 'Tiki' });
    });
  } catch (e) { console.error('Tiki loi:', e.message); }
  // Open Library sau: sach quoc te va ban dich.
  try {
    const r = await fetchJson('https://openlibrary.org/search.json?q=' + encodeURIComponent(q) + '&limit=8&fields=title,author_name,first_publish_year,number_of_pages_median,cover_i,isbn');
    const j = await r.json();
    (j.docs || []).forEach(doc => {
      const isbn13 = (doc.isbn || []).find(x => /^978/.test(x)) || (doc.isbn || [])[0] || '';
      push({ title: doc.title, author: (doc.author_name || [])[0] || '', year: doc.first_publish_year || null, pages: doc.number_of_pages_median || null, cover: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : '', isbn: isbn13, source: 'Open Library' });
    });
  } catch (e) { console.error('Open Library search loi:', e.message); }
  // Gop trung theo ten + tac gia.
  const seen = new Set(), out = [];
  for (const b of results) { const k = (b.title + '|' + b.author).toLowerCase(); if (seen.has(k)) continue; seen.add(k); out.push(b); if (out.length >= 10) break; }
  res.json({ results: out });
});

// ---------- Books (theo tai khoan) ----------
app.get('/api/books', auth, (req, res) => res.json(db.books.filter(b => b.userId === req.user.id)));
app.post('/api/books', auth, (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'Nhap tieu de sach.' });
  const book = { id: uid(), userId: req.user.id, title: cleanStr(b.title), author: cleanStr(b.author), genre: cleanStr(b.genre), year: b.year || null, pages: b.pages || null, isbn: cleanStr(b.isbn), cover: cleanStr(b.cover), location: cleanStr(b.location), status: ['ready','reading','lent','lost'].includes(b.status) ? b.status : 'ready', reader: cleanStr(b.reader), progress: Math.max(0, Math.min(100, Number(b.progress) || 0)), rating: Math.max(0, Math.min(5, Number(b.rating) || 0)), review: cleanStr(b.review), createdAt: new Date().toISOString() };
  db.books.push(book); saveData(); res.status(201).json(book);
});
app.put('/api/books/:id', auth, (req, res) => {
  const book = db.books.find(b => b.id === req.params.id && b.userId === req.user.id);
  if (!book) return res.status(404).json({ error: 'Khong tim thay sach.' });
  Object.assign(book, req.body, { id: book.id, userId: book.userId });
  for (const k of ['title', 'author', 'genre', 'cover', 'location', 'review', 'reader', 'isbn']) if (typeof book[k] === 'string') book[k] = book[k].normalize('NFC');
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
  const m = { id: uid(), userId: req.user.id, name: cleanStr(name), avatar: cleanStr(avatar) || '📚', color: color || '#c97b4a' };
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
  const w = { id: uid(), userId: req.user.id, title: cleanStr(title), author: cleanStr(author), note: cleanStr(note) };
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
  const clean = (arr) => (Array.isArray(arr) ? arr : []).map(x => ({ ...nfcDeep(x), id: uid(), userId: req.user.id }));
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
