# راهنمای انتشار

این سند مراحل رسیدن از کد فعلی به یک APK امضاشده است. هر مرحله‌ای که **در این محیط ساخته و آزموده شده** مشخص است؛ مراحل Android به Android Studio و یک گوشی واقعی نیاز دارند و تا اجرا نشوند «تأییدنشده»اند ([`DEVICE-TEST.md`](DEVICE-TEST.md)).

## ۱. چه چیزی هنوز جلوی انتشار را می‌گیرد

| مورد | وضعیت | وابسته به |
|---|---|---|
| بازبینی محتوا توسط متخصص HSE | ۸۵ سؤال، ۳۲ سناریو و ۱ صحنه (۱۰ خطر) همگی `draft`؛ `npm run verify:release` تا تمام نشود رد می‌کند | متخصص HSE ([`REVIEW.md`](REVIEW.md)) |
| تصویر واقعی صحنه‌ها | `site-01` موقت است؛ هدف ۸ صحنه | تصویرساز/عکاس ([`SCENE-BRIEFS.md`](SCENE-BRIEFS.md)) |
| نام و `appId` نهایی | هر دو موقت‌اند | مالک پروژه |
| تست روی دستگاه | هیچ‌کدام از موارد native اجرا نشده | یک گوشی + Android Studio ([`DEVICE-TEST.md`](DEVICE-TEST.md)) |
| حجم محتوای v1 | ۸۵ سؤال از ≈۳۰۰، ۳۲ سناریو از ≈۴۰، ۱ صحنه از ≈۸ | نویسندگی + بازبینی |

## ۲. نام و `appId`

`appId` پس از اولین انتشار قابل تغییر نیست (تغییرش یعنی اپ دیگر). این‌ها باید با هم و **پیش از اولین انتشار** عوض شوند:

| فایل | چه چیزی |
|---|---|
| `capacitor.config.ts` | `appId`، `appName` |
| `android/app/build.gradle` | `namespace`، `applicationId` |
| `android/app/src/main/java/app/hsequest/separ/MainActivity.java` | خط `package` **و** مسیر پوشه‌ها (`app/hsequest/separ`) |
| `android/app/src/main/res/values/strings.xml` | `app_name`، `title_activity_main`، `package_name`، `custom_url_scheme` |
| `src/i18n/messages/fa.ts` | `app.name`، `app.subtitle` |
| `index.html`، `package.json` | عنوان، `name`/`description` |

بعد از تغییر: `npm run cap:sync` (فایل `android/app/src/main/assets/capacitor.config.json` از نو ساخته می‌شود، دستی ویرایشش نکنید) و یک build تازه. آیکون لانچر متن ندارد ولی Splash کل لوگو را نشان می‌دهد (`branding/logo.svg`، با نوشته‌ی «IHMS GAMES») و تغییر نام آن را عوض نمی‌کند؛ اگر نام عوض شد، لوگو را هم جایگزین و `npm run assets:android` را اجرا کنید.

## ۲.۵. ساخت APK با GitHub Actions (بدون Android Studio)

workflow ‏`.github/workflows/build-android.yml` با هر push به `main` و با «Run workflow» در تب Actions اجرا می‌شود (حدود ۳ تا ۴ دقیقه): `npm run check`، build و sync، `gradlew assembleDebug`، و سپس `verify:merged` روی Manifest ادغام‌شده‌ی همان build.

۱. در GitHub: ریپو ‹ **Actions** ‹ «Build Android APK» ‹ آخرین اجرای سبز.
۲. پایین صفحه، بخش **Artifacts** ‹ `ihms-shield-debug-apk` را دانلود کنید (zip است؛ داخلش `ihms-shield-<نسخه>-debug.apk`؛ اول zip را کامل Extract کنید و بعد APK را از برنامه‌ی فایل‌ها نصب کنید، نه از داخل برنامه‌ی آرشیو). دانلود artifact نیاز به ورود با حساب GitHub دارد و ۳۰ روز می‌ماند.
۳. APK را روی گوشی بریزید و نصب کنید (اجازه‌ی «نصب از منبع ناشناس» برای برنامه‌ی فایل‌منیجر).

کلید debug در cache گیت‌هاب نگه داشته می‌شود (نه در مخزن) تا هر ساخت تازه روی ساخت قبلی نصب شود و پیشرفت بازیکن بماند. اگر cache پاک شد (۷ روز بدون ساخت) یا برای اولین بار بعد از اضافه‌شدنش، یک بار پیام «conflicts with an existing package» می‌آید: اول از تنظیمات برنامه پشتیبان بگیرید، نسخه‌ی قبلی را حذف کنید، نصب کنید و پشتیبان را بازیابی کنید.

این APK **debug** است: با کلید خودکار debug امضا شده، پس روی هر گوشی نصب می‌شود ولی برای Play Store نیست و `debuggable` است. محتوا هم هنوز draft است ([`REVIEW.md`](REVIEW.md))؛ فقط برای آزمایش. برای نسخه‌ی release امضاشده باید keystore بسازید (بخش ۴) و رازهایش را به‌صورت GitHub Secrets به workflow بدهید؛ این هنوز ساخته نشده.

## ۳. ساخت نسخه‌ی debug و بازرسی Manifest ادغام‌شده (روی ماشین خودتان)

نیازمند: JDK 21 و Android Studio (SDK 36). اولین build اینترنت لازم دارد تا Gradle وابستگی‌ها را بگیرد (فقط برای **ساخت**، نه اجرای اپ).

```bash
npm install
npm run cap:sync        # نسخه را به Android منتقل می‌کند، build می‌کند، guard آفلاین را اجرا و sync می‌کند
npm run cap:open        # در Android Studio: Run روی دستگاه، یا Build ‹ Build Bundle(s) / APK(s)
npm run verify:merged   # Manifest ادغام‌شده‌ی همین build را با قواعد آفلاین/حریم خصوصی می‌سنجد
```

`verify:merged` آخرین Manifest ادغام‌شده را زیر `android/app/build/intermediates` پیدا می‌کند (یا مسیر فایل را بدهید). این همان بررسی‌ای است که `verify:offline` نمی‌تواند بکند: چیزی که Gradle هنگام ادغام اضافه می‌کند. اگر مجوز تازه‌ای نشان داد (مثلاً از یک کتابخانه‌ی androidx)، یا دلیل‌اش را مستند کنید و در `scripts/permissions.mjs` بیاورید، یا منبعش را حذف کنید؛ `INTERNET` هرگز.

**چیزهایی که باید اولین بار با چشم دیده شوند** (در `verify:merged` به‌عنوان یادداشت چاپ می‌شوند): فهرست مؤلفه‌های `exported`، و این‌که `SCHEDULE_EXACT_ALARM` واقعاً حذف شده باشد.

## ۴. keystore (یک بار، بیرون از ریپو)

```bash
mkdir -p ~/.hse-quest
keytool -genkeypair -v -keystore ~/.hse-quest/hse-quest-release.jks \
  -alias hsequest -keyalg RSA -keysize 4096 -validity 10000
```

فایل `~/.hse-quest/keystore.properties`:

```properties
storeFile=/home/NAME/.hse-quest/hse-quest-release.jks
storePassword=…
keyAlias=hsequest
keyPassword=…
```

```bash
export HSEQUEST_KEYSTORE_PROPERTIES=~/.hse-quest/keystore.properties
```

- **هیچ‌کدام از این‌ها داخل ریپو نمی‌رود** (`*.jks` و `*.keystore` در `.gitignore` هستند، و مسیر فایل رمزها از متغیر محیطی خوانده می‌شود).
- **اگر keystore یا رمزش گم شود، دیگر نمی‌توان به‌روزرسانی همان اپ را امضا کرد.** دو نسخه‌ی پشتیبان در دو جای جدا نگه دارید و رمزها را جدا از فایل.
- بدون این متغیر، build release فقط **بدون امضا** ساخته می‌شود؛ build debug هیچ‌وقت به آن نیاز ندارد.
- این پیکربندی Gradle (`android/app/build.gradle`) استاندارد است ولی در این محیط اجرا نشده (Gradle/SDK ندارد): اولین build امضاشده را بررسی کنید.

## ۵. نسخه

منبع نسخه `package.json` است. `versionName` همان نسخه است و `versionCode` از آن ساخته می‌شود (`x.y.z` ← `x*10000 + y*100 + z`، پس همیشه با نسخه‌ی بالاتر بالاتر می‌رود). `npm run cap:sync` آن را در `android/app/build.gradle` می‌نویسد و `npm run check` ناهماهنگی‌شان را رد می‌کند.

```bash
npm version 0.9.0 --no-git-tag-version   # مثلاً برای بتا
npm run cap:sync
```

## ۶. ساخت release

```bash
npm run verify:release -- --allow-draft   # بتا: جدول وضعیت محتوا را نشان می‌دهد
npm run verify:release                    # نسخه‌ی نهایی: باید پاس شود (همه‌ی محتوا reviewed)
npm run cap:sync
cd android && ./gradlew assembleRelease   # APK  — یا bundleRelease برای AAB
cd .. && npm run verify:merged -- --release
```

خروجی: `android/app/build/outputs/apk/release/`. امضا را بسنجید: `apksigner verify --verbose --print-certs app-release.apk`. `--release` علاوه بر قواعد معمول، build قابل‌دیباگ را هم رد می‌کند.

## ۷. بتا

- همیشه با `--allow-draft` و نسخه‌ی `0.x`. تا وقتی چیزی `draft` است، تنظیمات ‹ درباره به بازیکن می‌گوید بخشی از محتوا بازبینی نشده (خودکار؛ با تمام‌شدن بازبینی [`REVIEW.md`](REVIEW.md) ناپدید می‌شود)، و بتا باید فقط به آزمایش‌کنندگان معرفی‌شده برسد.
- برنامه هیچ گزارش خطا یا آماری نمی‌فرستد (عمداً)؛ بازخورد باید دستی بیاید. از آزمایش‌کننده‌ها بخواهید [`DEVICE-TEST.md`](DEVICE-TEST.md) را پر کنند و مدل گوشی و نسخه‌ی Android را بنویسند.
- به‌روزرسانی روی نسخه‌ی قبلی (با همان `appId` و همان keystore) باید داده را نگه دارد؛ این هم یکی از آزمون‌های DEVICE-TEST است.

## ۸. دروازه‌ی نسخه‌ی ۱٫۰

۱. `npm run check` سبز، `npm run e2e` و `npm run perf` سبز.
۲. `npm run verify:release` پاس (همه‌ی آیتم‌ها `reviewed` با نام و تاریخ بازبین).
۳. همه‌ی ردیف‌های [`DEVICE-TEST.md`](DEVICE-TEST.md) روی دست‌کم یک گوشی جدید و یک گوشی قدیمی (Android 7–9) ✓.
۴. `npm run verify:merged -- --release` پاس روی همان APK که منتشر می‌شود.
۵. نام و `appId` نهایی، تصویر واقعی صحنه‌ها، `version` ≥ `1.0.0`.
