# Found It — ระบบแจ้งของหายและของที่พบในโรงเรียน

เว็บสำหรับแจ้งของหายและของที่พบ ค้นหารายการตามหมวดหมู่และสถานที่ ติดต่อผู้แจ้งผ่านข้อความส่วนตัว และส่งข้อความถึงเจ้าหน้าที่ได้

- มีตัวกรอง “ยังไม่มีผู้รับ” สำหรับประกาศสิ่งของที่พบและยังเปิดอยู่
- ผู้พบระบุจุดฝากของเพื่อให้เจ้าของไปรับคืนได้
- เจ้าของประกาศสร้าง QR ยืนยันรับคืนได้ รหัสใช้ครั้งเดียวและหมดอายุใน 60 นาที ผู้รับต้องเข้าสู่ระบบและยืนยันก่อนปิดประกาศ
- QR ใช้ข้ามอุปกรณ์ได้เมื่อเว็บเปิดผ่าน URL ที่อุปกรณ์ผู้รับเข้าถึงได้ เช่น deployment หรือ public tunnel (`start-public.ps1`); ลิงก์ `127.0.0.1` ใช้ได้เฉพาะเครื่องที่รันเว็บ ตั้ง `PUBLIC_APP_URL` หากต้องกำหนด URL เอง
- นักเรียนติดตามและยกเลิกคำขอรับของคืนที่ยังรอพิจารณาได้จากหน้าโปรไฟล์ และเปลี่ยนรหัสผ่านได้ การเปลี่ยนรหัสผ่านจะออกจากระบบอุปกรณ์อื่น


## Deploy to Vercel

This project is configured as a static site with a Node.js Function for `/api/*`. Account records, reports, and messages are stored in Upstash Redis; uploaded photos are stored in Vercel Blob. Vercel Functions have a read-only filesystem apart from temporary `/tmp` storage, so the local JSON and `uploads/` folders are only for local development.

1. Push this repository to GitHub, then import it from the Vercel dashboard. Keep the project root at the repository root and use the default install/build settings.
2. Create an Upstash Redis database and connect it to the Vercel project. The app reads `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or the equivalent `KV_REST_API_URL` and `KV_REST_API_TOKEN`).
3. Create a Vercel Blob store and connect it to the same project. The app uses the Vercel Blob SDK with public image URLs; only upload photos that are appropriate for anyone with the URL to view.
4. Add `SESSION_SECRET` and `ADMIN_SETUP_CODE` to the Vercel project environment variables for Preview and Production. Use long, unique random values; never commit them. `SESSION_SECRET` must remain unchanged or existing sessions will be signed out. The admin setup code is needed once to create the built-in first administrator identity (`AdminRK` / `T36699`). Remove `ADMIN_SETUP_CODE` after the administrator account is created.
5. Optionally set `STAFF_STUDENT_ID` to the student ID assigned the staff role. Deploy the project after connecting the storage and setting the environment variables.

A missing Redis or session secret makes protected API actions return a setup error; it does not fall back to temporary storage. The Redis document updates are serialized with a short-lived lock so concurrent report and message submissions do not overwrite one another. For local development, `npm start` continues to use `data/store.json` and `uploads/`.

For the first admin account, enter the configured `ADMIN_SETUP_CODE` in the administrator setup field. Do not put that code in the source repository or in a public README.

## สิ่งที่ต้องมี

- Windows และ PowerShell
- Node.js
- cloudflared หากต้องการเปิดลิงก์ให้คนอื่นเข้าจากอินเทอร์เน็ต

## เปิดเว็บบนเครื่อง

เปิด PowerShell ในโฟลเดอร์โปรเจกต์ แล้วรัน:

~~~powershell
npm install
powershell -ExecutionPolicy Bypass -File .\start-server.ps1
~~~

จากนั้นเปิด http://127.0.0.1:3000

## เปิดเว็บให้คนอื่นเข้าผ่านลิงก์ชั่วคราว

รันคำสั่งนี้ใน PowerShell ที่เปิดในโฟลเดอร์โปรเจกต์:

~~~powershell
powershell -ExecutionPolicy Bypass -File .\start-public.ps1
~~~

สคริปต์จะเริ่มเว็บและเปิดหน้าเว็บในเครื่อง ลิงก์สาธารณะจะแสดงในหน้าต่าง PowerShell คัดลอกลิงก์ trycloudflare.com แล้วส่งให้ผู้ใช้คนอื่นได้

ระหว่างแชร์เว็บ ต้องเปิดเครื่องและหน้าต่าง PowerShell ค้างไว้ หากปิดหน้าต่างหรือหยุดโปรแกรม ลิงก์จะเข้าเว็บไม่ได้ เมื่อเริ่มใหม่จะได้รับลิงก์ชั่วคราวอันใหม่

## ตั้งค่าผู้ดูแลระบบ

หากยังไม่มีบัญชีผู้ดูแลระบบ เซิร์ฟเวอร์จะแสดงรหัสตั้งค่าครั้งเดียวในหน้าต่าง PowerShell ให้สมัครด้วยชื่อ AdminRK และรหัสนักเรียน T36699 จากนั้นกรอกรหัสดังกล่าวและตั้งรหัสผ่าน เมื่อสร้างบัญชีแล้ว รหัสตั้งค่าจะใช้ซ้ำไม่ได้

ช่องทางเข้าสู่ระบบผู้ดูแลด้วยรหัส A1010 เป็นบัญชีแยกต่างหาก และจะใช้ได้เมื่อกำหนด `ADMIN_LOGIN_PASSWORD` เองเท่านั้น ระบบไม่มีรหัสผ่านเริ่มต้นสำหรับบัญชีนี้

เก็บหน้าต่าง PowerShell ที่แสดงรหัสนี้ไว้เป็นส่วนตัว ผู้ดูแลระบบสามารถดูสรุปรายงาน ตอบข้อความที่ส่งถึงโรงเรียน และจัดการบัญชีนักเรียนได้ การลบบัญชีนักเรียนจะลบรายงาน รูปภาพ และข้อความที่เกี่ยวข้องด้วย บัญชีผู้ดูแลระบบไม่สามารถลบจากแผงควบคุมได้

## ตั้งค่าบัญชีเจ้าหน้าที่

สำหรับการสาธิต สามารถกำหนดรหัสนักเรียนของเจ้าหน้าที่ก่อนเริ่มเซิร์ฟเวอร์ได้:

~~~powershell
$env:STAFF_STUDENT_ID = 'staff-id-here'
node server.js
~~~

ระบบจะกำหนดบทบาทเจ้าหน้าที่ให้บัญชีที่ใช้รหัสนักเรียนตรงกันเท่านั้น วิธีนี้ไม่ได้ตรวจสอบว่าบุคคลนั้นเป็นเจ้าหน้าที่ของโรงเรียนจริง

## ข้อมูลและการจัดเก็บ

- บัญชีและรายการแจ้งของหายเก็บใน data/store.json
- รูปภาพเก็บในโฟลเดอร์ uploads/
- สองโฟลเดอร์นี้ไม่รวมอยู่ใน Git เพื่อไม่ให้ข้อมูลถูกส่งไปพร้อมซอร์สโค้ด
- เซสชันเข้าสู่ระบบเก็บในหน่วยความจำของเซิร์ฟเวอร์ เมื่อปิดหรือเริ่มเซิร์ฟเวอร์ใหม่ ผู้ใช้อาจต้องเข้าสู่ระบบอีกครั้ง
- ควรสำรองข้อมูลใน data/ และ uploads/ อย่างปลอดภัย

## ข้อควรทราบ

ลิงก์ Cloudflare แบบชั่วคราวทำให้ผู้ที่มีลิงก์เข้าถึงหน้าเว็บจากอินเทอร์เน็ตได้ การเข้าสู่ระบบช่วยป้องกันหน้าข้อมูลภายในแอป แต่ระบบสาธิตนี้ยังไม่ได้ตรวจสอบตัวตนนักเรียนกับบัญชีหรือทะเบียนของโรงเรียน อย่าใช้ข้อมูลจริงของนักเรียนจนกว่าโรงเรียนจะเพิ่มการตรวจสอบตัวตน การจัดเก็บฐานข้อมูลและรูปภาพที่เหมาะสม การสำรองข้อมูล และนโยบายบัญชีเจ้าหน้าที่
