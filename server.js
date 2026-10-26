const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error(e); res.status(500).json({ ralat: 'Ralat pelayan' }); });
const bersih = s => String(s || '').trim().replace(/\s+/g, ' ');

app.get('/api/guru', wrap(async (_, res) => res.json((await pool.query('SELECT id, nama FROM guru ORDER BY nama')).rows)));
app.get('/api/kelas', wrap(async (_, res) => res.json((await pool.query('SELECT id, nama FROM kelas ORDER BY nama')).rows)));

async function tambah(jadual, req, res) {
  const nama = bersih(req.body.nama);
  if (!nama) return res.status(400).json({ ralat: 'Nama diperlukan' });
  const r = await pool.query(
    `INSERT INTO ${jadual} (nama) VALUES ($1)
     ON CONFLICT (nama) DO UPDATE SET nama = EXCLUDED.nama RETURNING id, nama`, [nama]);
  res.json(r.rows[0]);
}
app.post('/api/guru', wrap((req, res) => tambah('guru', req, res)));
app.post('/api/kelas', wrap((req, res) => tambah('kelas', req, res)));

app.get('/api/tempahan', wrap(async (_, res) => {
  const r = await pool.query(`
    SELECT t.id, g.nama AS guru, k.nama AS kelas,
           to_char(t.tarikh,'YYYY-MM-DD') AS tarikh,
           to_char(t.masa_mula,'HH24:MI') AS mula, to_char(t.masa_tamat,'HH24:MI') AS tamat
    FROM tempahan t JOIN guru g ON g.id = t.guru_id JOIN kelas k ON k.id = t.kelas_id
    ORDER BY t.tarikh DESC, t.masa_mula`);
  res.json(r.rows);
}));

app.post('/api/tempahan', wrap(async (req, res) => {
  const { guru_id, kelas_id, tarikh, mula, tamat } = req.body;
  if (!guru_id || !kelas_id || !tarikh || !mula || !tamat) return res.status(400).json({ ralat: 'Sila lengkapkan semua maklumat' });
  if (tamat <= mula) return res.status(400).json({ ralat: 'Masa tamat mesti selepas masa mula' });
  const bertindih = await pool.query(
    `SELECT g.nama, k.nama AS kelas, to_char(t.masa_mula,'HH24:MI') AS mula, to_char(t.masa_tamat,'HH24:MI') AS tamat
     FROM tempahan t JOIN guru g ON g.id=t.guru_id JOIN kelas k ON k.id=t.kelas_id
     WHERE t.tarikh=$1 AND t.masa_mula < $3::time AND t.masa_tamat > $2::time LIMIT 1`, [tarikh, mula, tamat]);
  if (bertindih.rows.length) {
    const b = bertindih.rows[0];
    return res.status(409).json({ ralat: `Bertindih dengan tempahan ${b.nama} (${b.kelas}), ${b.mula}–${b.tamat}` });
  }
  const r = await pool.query(
    'INSERT INTO tempahan (guru_id, kelas_id, tarikh, masa_mula, masa_tamat) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [guru_id, kelas_id, tarikh, mula, tamat]);
  res.json(r.rows[0]);
}));

app.delete('/api/tempahan/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM tempahan WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

app.listen(process.env.PORT || 3000, () => console.log('Sedia di http://localhost:' + (process.env.PORT || 3000)));
