Catatan Kemajuan — 20 Mei 2026
Ringkasan
Telah berhasil menambahkan subsistem generasi video AI + fitur posting otomatis TikTok / YouTube Shorts.
Dikerjakan dengan 5 agen paralel → direview oleh 3 agen paralel → 6 perbaikan CRITICAL telah selesai.
TypeScript build sudah clean. Selanjutnya diperlukan pekerjaan setup dari sisi user.

✅ Pekerjaan yang Sudah Selesai
Implementasi Kode

 Membuat 3 migration Supabase
supabase/migrations/20260520_videos_and_scenes.sql
supabase/migrations/20260520_videos_pipeline_extensions.sql
supabase/migrations/20260520_video_storage_bucket.sql

 Perluasan definisi tipe (src/types/database.ts)
Platform: 'threads' | 'instagram' | 'x' | 'tiktok' | 'youtube'
Tipe baru: Video, Scene, VideoStatus, PublishStatus, VideoWithScenes
Menambahkan kolom tiktok/youtube di tabel Account
Menambahkan kolom elevenlabs_key di UserApiKeys

 GPT Script + Scene Splitting: src/lib/video/script.ts
 ElevenLabs TTS: src/lib/video/elevenlabs.ts
 Supabase Storage helpers: src/lib/video/storage.ts
 Pipeline Orchestrator: src/lib/video/pipeline.ts
 Job Queue Abstraction: src/lib/video/jobs.ts
 Remotion subproject: remotion/ (komposisi ShortVideoMain, 1080×1920 30fps)
 Integrasi TikTok Publisher + OAuth
 Integrasi YouTube Publisher + OAuth
 Video API: src/app/api/videos/** (CRUD + status + regenerate + publish)
 Video UI: src/app/(dashboard)/dashboard/videos/** dan komponen terkait
 Dokumen desain arsitektur: docs/video-pipeline-design.md
 Hasil Triple Review: docs/review/{security,architecture,ts-ux}-review.md

Perbaikan Bug (CRITICAL — 6 kasus)

 Mengenkripsi TikTok access_token dengan AES-256-GCM (sinkron dengan YouTube)
 Menghapus fetchVideoBytes (tanpa SSRF guard) dari youtube.ts
 Mengubah pesan error saat publish gagal menjadi teks statis (mencegah kebocoran struktur DB)
 Menyimpan final_video_url sebagai signed URL (bukan storagePath)
 Perubahan pengambilan ElevenLabs key menggunakan userId + admin client
 Membersihkan double-cast pada OpenAI image SDK

Perbaikan Bug (HIGH tambahan)

 Audio leak di SceneRow.tsx → ditambahkan cleanup useEffect + useRef
 Notifikasi Toast saat polling gagal di VideoDetail.tsx
 Masalah 403 video → terselesaikan otomatis melalui perbaikan CRITICAL #4


🚧 Pekerjaan Tersisa (Harus Dilakukan oleh User)
1. Penerapan Migration Supabase ✅ Selesai 20 Mei 2026
Sudah diterapkan ke database produksi. Tabel videos, scenes, kolom baru, dan bucket storage videos sudah siap.
2. Pengaturan Environment Variable
Tambahkan ke .env.local atau Vercel Project Settings:
BashENCRYPTION_KEY=<32 byte base64>
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=...
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=https://<your-domain>/api/auth/tiktok/callback
YOUTUBE_OAUTH_CLIENT_ID=...
YOUTUBE_OAUTH_CLIENT_SECRET=...
YOUTUBE_OAUTH_REDIRECT_URI=https://<your-domain>/api/auth/youtube/callback
NEXT_PUBLIC_APP_URL=https://<your-domain>
TRIGGER_PUBLIC_API_KEY=...
# REMOTION_PROVIDER=lambda
3. Pengajuan TikTok Developer Portal

Buat aplikasi, ajukan Login Kit + Content Posting API
Estimasi review: 2–6 minggu

4. Setup Google Cloud Console (YouTube)

Aktifkan YouTube Data API v3
Buat OAuth 2.0 Client
Tambahkan test user (email klien)

5. Keputusan Desain TikTok (Perlu Diskusi)
Masalah registrasi domain untuk PULL_FROM_URL:

Opsi A: Ganti ke FILE_UPLOAD (butuh perubahan kode)
Opsi B: Pasang proxy domain sendiri
Opsi C: Sementara tunda TikTok, fokus YouTube dulu

Rekomendasi: C → A
6. Infrastruktur Background Job
Disarankan menggunakan Trigger.dev untuk menghindari timeout Vercel.
7. Infrastruktur Rendering Remotion
Untuk produksi, perlu @remotion/lambda atau dedicated worker.

📋 Bug yang Masih Tersisa (Bisa ditangani nanti)
Security:

HIGH: Registrasi domain TikTok
MEDIUM: Beberapa error message masih bocor nama file

Architecture:

MEDIUM: Penanganan partial state saat pipeline gagal

TypeScript + UX:

HIGH: Validasi input masih manual (Zod belum optimal)
MEDIUM: Beberapa komponen belum menggunakan next/image
