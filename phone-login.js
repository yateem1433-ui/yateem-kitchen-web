// ล็อกอินด้วยเบอร์โทรศัพท์ (Firebase Phone Auth + รหัส OTP ทาง SMS) - ใช้ร่วมกันทั้ง index.html และ track.html
// ต้องโหลด firebase-app-compat + firebase-auth-compat และ initializeApp ก่อนเรียก PhoneLogin.open()
// หลังบ้านรับบัญชีแบบนี้ผ่าน idToken เหมือน Google (providerId 'phone' → LoginChannel 'Phone', userId 'fb:<uid>')
//
// ถ้าเครื่องนี้มีบัญชี anonymous อยู่ (เช่นจากแชท Yateem TV โดเมนเดียวกัน) จะ "ผูก" เบอร์เข้ากับบัญชีเดิม
// เพื่อให้ uid เดิมอยู่ต่อ (กระเป๋าเหรียญ/ประวัติในทีวีไม่หาย) - ถ้าเบอร์นี้เคยมีบัญชีแล้วก็สลับไปใช้บัญชีนั้นแทน
(function () {
    let confirmation = null;
    let verifier = null;
    let onSuccess = null;

    const HTML = `
    <div id="phone-login-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <p class="text-5xl mb-2 text-center">📱</p>
            <h2 class="text-lg font-bold text-gray-800 mb-1 text-center">เข้าสู่ระบบด้วยเบอร์โทรศัพท์</h2>
            <div id="phone-step-1">
                <p class="text-sm text-gray-600 mb-3 text-center">กรอกเบอร์มือถือ ระบบจะส่งรหัส OTP 6 หลักทาง SMS ให้ค่ะ</p>
                <input id="phone-login-input" type="tel" inputmode="tel" autocomplete="tel" placeholder="เช่น 0812345678"
                       class="w-full p-3 border rounded-lg text-lg text-center mb-3">
                <button id="phone-login-send" type="button" class="w-full bg-blue-600 text-white font-bold py-3 rounded-lg">ส่งรหัส OTP</button>
            </div>
            <div id="phone-step-2" class="hidden">
                <p id="phone-login-sent" class="text-sm text-gray-600 mb-3 text-center"></p>
                <input id="phone-login-otp" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="รหัส 6 หลัก"
                       class="w-full p-3 border rounded-lg text-2xl text-center mb-3" style="letter-spacing:.4em">
                <button id="phone-login-confirm" type="button" class="w-full bg-green-600 text-white font-bold py-3 rounded-lg">ยืนยันรหัส</button>
                <button id="phone-login-back" type="button" class="w-full text-sm text-blue-600 underline mt-2">เปลี่ยนเบอร์ / ขอรหัสใหม่</button>
            </div>
            <p id="phone-login-error" class="hidden text-sm text-red-600 text-center mt-3"></p>
            <div id="phone-login-recaptcha"></div>
            <button id="phone-login-close" type="button" class="w-full bg-gray-200 text-gray-700 font-bold py-2 rounded-lg mt-3">ปิด</button>
        </div>
    </div>`;

    function el(id) { return document.getElementById(id); }

    function mount() {
        if (el('phone-login-modal')) return;
        document.body.insertAdjacentHTML('beforeend', HTML);
        el('phone-login-send').onclick = sendOtp;
        el('phone-login-confirm').onclick = confirmOtp;
        el('phone-login-back').onclick = function () { showStep(1); };
        el('phone-login-close').onclick = close;
        el('phone-login-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') sendOtp(); });
        el('phone-login-otp').addEventListener('keydown', function (e) { if (e.key === 'Enter') confirmOtp(); });
    }

    // เบอร์ไทย 08x/09x/06x → +66... | รับ +66/66 นำหน้า และเบอร์ต่างประเทศที่ขึ้นต้นด้วย + ด้วย
    function toE164(raw) {
        const s = String(raw || '').replace(/[\s\-().]/g, '');
        if (/^\+\d{8,15}$/.test(s)) return s;
        if (/^0\d{8,9}$/.test(s)) return '+66' + s.slice(1);
        if (/^66\d{8,9}$/.test(s)) return '+' + s;
        return '';
    }

    function errorText(err) {
        const code = (err && err.code) || '';
        if (code === 'auth/invalid-phone-number') return 'เบอร์โทรศัพท์ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้งค่ะ';
        if (code === 'auth/too-many-requests' || code === 'auth/quota-exceeded') return 'ขอรหัสบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่ค่ะ';
        if (code === 'auth/invalid-verification-code') return 'รหัส OTP ไม่ถูกต้อง กรุณาลองใหม่ค่ะ';
        if (code === 'auth/code-expired') return 'รหัส OTP หมดอายุแล้ว กรุณากดขอรหัสใหม่ค่ะ';
        if (code === 'auth/operation-not-allowed' || code === 'auth/billing-not-enabled' || code === 'auth/unauthorized-domain') {
            return 'ระบบเข้าสู่ระบบด้วยเบอร์โทรยังไม่เปิดใช้งาน กรุณาใช้ LINE หรือ Google ไปก่อนนะคะ';
        }
        if (code === 'auth/captcha-check-failed') return 'ยืนยันตัวตนไม่ผ่าน กรุณาลองใหม่อีกครั้งค่ะ';
        if (code === 'auth/network-request-failed') return 'เชื่อมต่ออินเทอร์เน็ตไม่สำเร็จ กรุณาลองใหม่อีกครั้งค่ะ';
        return 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้งค่ะ' + (code ? ' (' + code + ')' : '');
    }

    function showError(msg) {
        el('phone-login-error').textContent = msg || '';
        el('phone-login-error').classList.toggle('hidden', !msg);
    }

    function showStep(n) {
        el('phone-step-1').classList.toggle('hidden', n !== 1);
        el('phone-step-2').classList.toggle('hidden', n !== 2);
        showError('');
        if (n === 1) { confirmation = null; setTimeout(function () { el('phone-login-input').focus(); }, 50); }
        else setTimeout(function () { el('phone-login-otp').focus(); }, 50);
    }

    function resetVerifier() {
        try { if (verifier) verifier.clear(); } catch (e) {}
        verifier = null;
        const box = el('phone-login-recaptcha');
        if (box) box.innerHTML = '';
    }

    async function sendOtp() {
        const phone = toE164(el('phone-login-input').value);
        if (!phone) { showError('กรุณากรอกเบอร์มือถือให้ถูกต้อง เช่น 0812345678'); return; }
        const btn = el('phone-login-send');
        btn.disabled = true;
        btn.textContent = 'กำลังส่งรหัส...';
        showError('');
        try {
            const auth = firebase.auth();
            auth.languageCode = 'th'; // SMS เป็นภาษาไทย
            if (!verifier) verifier = new firebase.auth.RecaptchaVerifier('phone-login-recaptcha', { size: 'invisible' });
            const cur = auth.currentUser;
            confirmation = (cur && cur.isAnonymous)
                ? await cur.linkWithPhoneNumber(phone, verifier)
                : await auth.signInWithPhoneNumber(phone, verifier);
            el('phone-login-sent').textContent = 'ส่งรหัสไปที่ ' + el('phone-login-input').value.trim() + ' แล้ว กรอกรหัส 6 หลักจาก SMS ค่ะ';
            el('phone-login-otp').value = '';
            showStep(2);
        } catch (err) {
            resetVerifier(); // reCAPTCHA ใช้ซ้ำไม่ได้หลังพลาด ต้องสร้างใหม่
            showError(errorText(err));
        } finally {
            btn.disabled = false;
            btn.textContent = 'ส่งรหัส OTP';
        }
    }

    async function confirmOtp() {
        const code = el('phone-login-otp').value.replace(/\D/g, '');
        if (code.length !== 6) { showError('กรุณากรอกรหัส 6 หลักจาก SMS ค่ะ'); return; }
        if (!confirmation) { showStep(1); return; }
        const btn = el('phone-login-confirm');
        btn.disabled = true;
        btn.textContent = 'กำลังยืนยัน...';
        showError('');
        try {
            let res;
            try {
                res = await confirmation.confirm(code);
            } catch (err) {
                // เบอร์นี้เคยมีบัญชีอยู่แล้ว (ผูกกับบัญชี anonymous ไม่ได้) → เข้าบัญชีเดิมของเบอร์นี้แทน
                if (err && err.code === 'auth/credential-already-in-use' && err.credential) {
                    res = await firebase.auth().signInWithCredential(err.credential);
                } else {
                    throw err;
                }
            }
            const user = (res && res.user) || firebase.auth().currentUser;
            close();
            if (onSuccess) onSuccess(user);
        } catch (err) {
            showError(errorText(err));
        } finally {
            btn.disabled = false;
            btn.textContent = 'ยืนยันรหัส';
        }
    }

    function open(opts) {
        if (typeof firebase === 'undefined' || !firebase.apps.length) {
            alert('โหลดระบบล็อกอินไม่สำเร็จ กรุณาลองใหม่อีกครั้งค่ะ');
            return;
        }
        onSuccess = (opts && opts.onSuccess) || null;
        mount();
        showStep(1);
        el('phone-login-modal').classList.remove('hidden');
    }

    function close() {
        const m = el('phone-login-modal');
        if (m) m.classList.add('hidden');
        confirmation = null;
    }

    // "081-234-5678" แบบปิดบางส่วน สำหรับโชว์ชื่อบัญชีที่ไม่มี displayName
    function maskPhone(e164) {
        const s = String(e164 || '');
        const local = s.indexOf('+66') === 0 ? '0' + s.slice(3) : s;
        return local.length > 4 ? local.slice(0, 3) + '-xxx-' + local.slice(-4) : local;
    }

    window.PhoneLogin = { open: open, close: close, maskPhone: maskPhone, toE164: toE164 };
})();
