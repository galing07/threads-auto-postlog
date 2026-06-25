# SNS Auto Post — Sistem Otomatis Posting AI Multi-Platform

Web app untuk **Threads / Instagram / X / TikTok / YouTube** yang menggunakan **AI untuk menghasilkan teks, gambar, video, dan mengelola posting secara otomatis**.

- **Nama paket**: `sns-auto-post`
- **Framework**: **Next.js 16** (App Router / React 19 / TypeScript)
- **Port lokal**: `3001` (`http://localhost:3001`)

---

## Fitur Utama

### Posting Teks & Gambar (Threads / Instagram / X)
- **Generasi Teks AI** — Membuat caption otomatis berdasarkan persona menggunakan OpenRouter (`google/gemini-2.5-flash`). Bisa memilih gaya: Buzz, Empati, Angka/Fakta, Cerita, atau Pertanyaan.
- **Generasi Gambar AI** — Membuat gambar/ilustrasi sesuai konten posting (OpenAI `gpt-image-2`).
- **Impor Referensi** — Tempel posting referensi (teks/gambar) dan AI akan menyesuaikan gaya (gambar dianalisis dengan Vision).
- **Generasi Massal** — Buat banyak posting sekaligus dan simpan sebagai draft.
- **Preview & Persetujuan** — Tinjau konten sebelum posting.
- **Jadwal Posting** — Posting otomatis sesuai tanggal dan waktu (menggunakan Supabase pg_cron).
- **Multi Akun** — Kelola banyak akun dengan persona berbeda.
- **Dukungan Thread** di X.

### Generasi & Posting Video Pendek (TikTok / YouTube / Instagram Reels)
- Pipeline lengkap: **Script → Scene → Narasi → Rendering**.
- **2 Mode Generasi Video**:
  - `remotion` → Rendering lokal (gambar + suara) — **Hanya bisa di lokal** (`npm run dev`).
  - `heygen_avatar` → Rendering cloud HeyGen — **Bisa digunakan di Vercel**.
- **Sintesis Suara** menggunakan ElevenLabs.
- Dukungan posting ke TikTok, YouTube Shorts, dan Instagram Reels.

### Fitur Umum
- **BYOK (Bring Your Own Key)** — Semua API Key (AI & Platform) diinput oleh user sendiri melalui halaman Pengaturan.
- Penyimpanan kunci dengan enkripsi **AES-256-GCM**.
- Rate limit, preset prompt per akun, dan riwayat posting.

---

## Tech Stack

| Kategori           | Teknologi |
|--------------------|---------|
| Frontend           | Next.js 16.2.4 (App Router) / React 19 / TypeScript 5 |
| Styling            | Tailwind CSS v4 / Radix UI / lucide-react |
| Validasi           | Zod |
| Database & Auth    | Supabase (PostgreSQL + RLS + Auth + Storage) |
| AI Teks            | OpenRouter (Gemini 2.5 Flash) |
| AI Gambar          | OpenAI (gpt-image-2) |
| Video              | Remotion 4.x / HeyGen |
| Suara              | ElevenLabs |
| Deployment         | Vercel |

---

## Cara Menjalankan di Lokal

### 1. Clone Repository
```bash
git clone https://github.com/RIKU0804/threads-auto-post.git
cd threads-auto-post
npm install
2. Setup Environment
Bashcp .env.example .env.local
Isi bagian yang wajib di .env.local.
3. Setup Supabase

Buat project di supabase.com
Jalankan supabase/full-setup.sql
Buat Storage bucket: post-images (public) dan videos

4. Jalankan Aplikasi
Bashnpm run dev
Buka → http://localhost:3001
