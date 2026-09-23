// Service worker ของแอปบอทครัว (voice.html) เท่านั้น - ลงทะเบียนด้วย scope './voice.html'
// จึงไม่ยุ่งกับหน้า Yateem Market (index.html / track.html)
// ไม่แคชอะไรเลย (โหลดจากเน็ตทุกครั้ง) กันปัญหาหน้าเก่าค้างหลังอัปเดต
// ดักแค่การเปิดหน้า: ถ้าเน็ตหลุดจะโชว์ข้อความภาษาไทยแทนหน้า error ของ Chrome
// คำขอ fetch ไปหลังบ้าน (Apps Script) ไม่ผ่านตัวนี้ ให้เบราว์เซอร์จัดการตามปกติ

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

const OFFLINE_HTML = '<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>บอทครัว Yateem</title></head>' +
    '<body style="margin:0;background:#0E2036;color:#fff;font-family:system-ui,sans-serif;display:flex;' +
    'min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px">' +
    '<div><h1 style="font-size:24px">📶 ไม่มีอินเทอร์เน็ต</h1>' +
    '<p style="color:#9fb6cf">บอทครัวต้องต่ออินเทอร์เน็ตเพื่อดึงออเดอร์ค่ะ<br>เช็ก Wi-Fi หรือเน็ตมือถือ แล้วแตะปุ่มด้านล่าง</p>' +
    '<button onclick="location.reload()" style="font-size:18px;padding:14px 22px;border:0;border-radius:12px;' +
    'background:#f59e0b;color:#1a1200;font-weight:700">ลองใหม่</button></div></body></html>';

self.addEventListener('fetch', event => {
    if (event.request.mode !== 'navigate') return;
    event.respondWith(
        fetch(event.request).catch(() => new Response(OFFLINE_HTML, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        }))
    );
});
