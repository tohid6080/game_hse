# سپر — HSE Quest

> نام موقت. اپلیکیشن مستقل، کاملاً آفلاین و موبایل‌محور برای تبدیل مهارت‌های HSE به بازی‌های کوتاه و تعاملی.

## اصول

- **مستقل از IHMS:** هیچ کد، سرویس یا وابستگی مشترکی با IHMS ندارد.
- **کاملاً آفلاین:** هیچ Backend، Supabase یا تماس شبکه‌ای در زمان اجرا وجود ندارد؛ مجوز `INTERNET` هم در Android حذف شده است.
- **داده‌ی محلی:** پیشرفت و تنظیمات فقط روی همین دستگاه (IndexedDB) ذخیره می‌شود. سورس پروژه به‌درخواست صریح مالک در ریپوی **public** ‏`tohid6080/game_hse` در GitHub است (تا Phase 4 فقط Local بود)؛ خودِ برنامه همچنان هیچ داده‌ای را جایی نمی‌فرستد.
- **فارسی و RTL در نسخه‌ی اول**؛ معماری برای افزودن انگلیسی آماده است.

## راه‌اندازی

پیش‌نیازها: Node.js ‏≥ 22، npm، و برای Android: JDK 21 و Android Studio (SDK 36).

```bash
npm install
npm run dev        # اجرای محیط توسعه
npm run check      # typecheck + lint + تست‌ها + بررسی آفلاین بودن
npm run e2e        # بازی کامل در Chromium واقعی (Onboarding تا پیشرفت)
npm run build      # خروجی production در dist/
```

ساخت APK (فقط روی ماشین توسعه):

```bash
npm run cap:sync   # build + بررسی آفلاین + همگام‌سازی با android/
npm run cap:open   # باز کردن پروژه در Android Studio و ساخت APK از آنجا
```

> Gradle Wrapper هنگام اولین build، Gradle و وابستگی‌های Android را دانلود می‌کند؛ این اینترنت فقط برای **ساخت** روی ماشین توسعه لازم است، نه برای اجرای اپ.

## دستورهای npm

| دستور | کار |
|---|---|
| `npm run dev` / `build` / `preview` | توسعه، ساخت، پیش‌نمایش build |
| `npm run typecheck` | بررسی TypeScript (نسخه‌ی ۶٫۰، قفل‌شده) |
| `npm run lint` | ESLint؛ شامل ممنوعیت API شبکه |
| `npm test` | تست‌های Vitest (منطق، ذخیره‌سازی، محتوا، i18n) |
| `npm run verify:offline` | Manifest و مجوز افزونه‌ها، بدون API/URL خارجی، CSP، بدون SDK بک‌اند |
| `npm run verify:version` | نسخه‌ی Android با `package.json` هماهنگ است |
| `npm run check` | همه‌ی موارد بالا |
| `npm run e2e` | build + بازی کامل در Chromium، با axe-core، تم روشن و متن ۱۳۰٪/۲۰۰٪ (نیازمند `CHROMIUM_PATH` یا `npx playwright-core install chromium`) |
| `npm run perf` | build + سنجش زمان‌ها و روانی با CPU ۴× و ۶× کندتر |
| `npm run cap:add` / `cap:sync` / `cap:open` | کار با پروژه‌ی Android (`cap:sync` نسخه را هم همگام می‌کند) |
| `npm run verify:merged` | Manifest ادغام‌شده‌ی build واقعی (پس از build در Android Studio) |
| `npm run verify:release` | محتوا کاملاً بازبینی‌شده است؟ (`-- --allow-draft` برای بتا) |
| `npm run content:export` / `content:apply` | برگه‌ی بازبینی محتوا برای متخصص HSE و ورود نتیجه |
| `npm run assets:android` | ساخت دوباره‌ی آیکون و Splash از `public/icon.svg` |

## ساختار

```
src/
  app/ pages/ ui/    پوسته، صفحه‌ها و design system
  i18n/              متن‌ها و قالب‌بندی (ارقام فارسی، تاریخ جلالی)
  domain/            منطق خالص (سطح و XP، ماشین‌حالت دور، ریسک، Streak، چالش روزانه، مدال، رادار)
  games/ content/    بازی‌ها (آزمون، ریسک، خطر)، رجیستری، بسته‌های محتوا و تصویر صحنه‌ها
  progress/ dev/     مدال‌ها، رادار و رتبه‌بندی؛ ابزارهای فقط‌توسعه (در build نهایی نیستند)
  backup/ reminders/ feedback/   پشتیبان‌گیری، یادآور روزانه، صدا و لرزش
  storage/ state/    Dexie + repositoryها، و storeهای zustand
  platform/          پوشش افزونه‌های Capacitor (با جایگزین وب)
docs/                ARCHITECTURE · DECISIONS · ROADMAP · RELEASE · DEVICE-TEST · REVIEW · SCENES · SCENE-BRIEFS
scripts/             verify-offline، verify-merged، verify-release، content-review، sync-version، آیکون و Splash
android/             پروژه‌ی Android (بدون مجوز INTERNET)
```

## وضعیت

Phase 0 (اسکلت)، Phase 1 (پروفایل و آزمون HSE)، Phase 2 (چالش ریسک، خطر را پیدا کن، چالش روزانه و Streak، مدال‌ها و رادار) و Phase 3 (رتبه‌بندی محلی، پشتیبان‌گیری و بازیابی، یادآور روزانه، صدا و لرزش، انیمیشن) انجام شده‌اند. در Phase 4 بخش کدِ آماده‌سازی انتشار انجام شد (سرعت، دسترس‌پذیری، امضا و نسخه، آیکون، خط لوله‌ی بازبینی محتوا). **آماده‌ی انتشار نیست:** محتوا هنوز توسط متخصص HSE بازبینی نشده ([`docs/REVIEW.md`](docs/REVIEW.md))، تصویر صحنه‌ها موقت است ([`docs/SCENE-BRIEFS.md`](docs/SCENE-BRIEFS.md))، نام و `appId` نهایی نیستند و هیچ‌چیز روی گوشی واقعی اجرا نشده ([`docs/DEVICE-TEST.md`](docs/DEVICE-TEST.md)). جزئیات و مراحل بعد در [`docs/ROADMAP.md`](docs/ROADMAP.md)؛ راه انتشار در [`docs/RELEASE.md`](docs/RELEASE.md).

## سلب مسئولیت

محتوای برنامه آموزشی است و جایگزین رویه‌ها، مجوزها و الزامات رسمی محل کار یا استانداردهای مرجع نیست.
