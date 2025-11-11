# Frontend - React + Vite

پروژه Frontend با React و Vite برای نمایش نقشه مغازه‌ها

## نصب Dependencies

```bash
npm install
```

## اجرای Development Server

```bash
npm run dev
```

Frontend روی `http://localhost:3000` اجرا می‌شود.

## Environment Variables

فایل `.env` را در پوشه `frontend` ایجاد کنید:

```env
VITE_API_URL=http://localhost:8000
```

## Build برای Production

```bash
npm run build
```

فایل‌های build در پوشه `dist` ایجاد می‌شوند.

## ساختار پروژه

```
frontend/
├── src/
│   ├── components/
│   │   └── NearbyStoresMap.tsx  # کامپوننت اصلی نقشه
│   ├── lib/
│   │   └── api.ts                # توابع API calls
│   ├── App.tsx                   # کامپوننت اصلی App
│   ├── main.tsx                  # Entry point
│   └── index.css                 # استایل‌های اصلی
├── index.html                    # HTML template
├── vite.config.ts                # تنظیمات Vite
└── package.json                  # Dependencies

