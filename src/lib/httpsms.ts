/**
 * httpsms.com SMS yuborish xizmati
 * API Key orqali O'zbekiston raqamlariga SMS yuborish
 */

export const HTTPSMS_API_KEY = "uk_d0Rz57nSH0U49wN6ixxlhH-k3Q_urnIkH-qPaIL5R2LrgdhmM7Sd3APk2OI507BQ";

export interface SendSmsParams {
  to: string; // Masalan: +998901234567 yoki 998901234567
  content: string;
  from?: string; // httpsms ilovasida ulangan telefon raqami (MAJBURIY)
}

export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  recipient: string;
}

/**
 * Telefon raqamini to'g'ri xalqaro formatga keltirish (+998...)
 */
export function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (!cleaned.startsWith('998') && cleaned.length === 9) {
    cleaned = '998' + cleaned;
  }
  return '+' + cleaned;
}

/**
 * httpsms da saqlangan standart yuboruvchi raqamni olish
 */
export function getDefaultFromPhone(): string {
  return (
    localStorage.getItem('httpsms_from_phone') ||
    import.meta.env.VITE_HTTPSMS_FROM_NUMBER ||
    ''
  );
}

/**
 * Standart yuboruvchi raqamni saqlash
 */
export function setDefaultFromPhone(phone: string): void {
  const formatted = formatPhoneNumber(phone);
  localStorage.setItem('httpsms_from_phone', formatted);
}

/**
 * httpsms.com orqali bitta SMS yuborish
 */
export async function sendSms({ to, content, from }: SendSmsParams): Promise<SmsSendResult> {
  const formattedPhone = formatPhoneNumber(to);
  const senderPhone = from || getDefaultFromPhone();

  if (!senderPhone) {
    return {
      success: false,
      recipient: formattedPhone,
      error: "Yuboruvchi telefon raqami (From) belgilanmagan! httpsms ilovasi o'rnatilgan telefon raqamingizni kiriting.",
    };
  }

  try {
    const formattedSender = formatPhoneNumber(senderPhone);
    const payload = {
      content: content,
      from: formattedSender,
      to: formattedPhone,
    };

    // Mahalliy ishlab chiqishda Vite proksi orqali, aks holda to'g'ridan-to'g'ri API ga
    const endpoint = (typeof window !== 'undefined' && window.location.hostname === 'localhost')
      ? '/api/httpsms/v1/messages/send'
      : 'https://api.httpsms.com/v1/messages/send';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': HTTPSMS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      let errMsg = data?.message || data?.error || `HTTP ${response.status} xatosi`;
      if (response.status === 422) {
        errMsg = `httpsms ma'lumotni qabul qilmadi (422): ${errMsg}. Yuboruvchi raqam (${formattedSender}) httpsms ilovasida faolligini tekshiring.`;
      }
      return {
        success: false,
        recipient: formattedPhone,
        error: errMsg,
      };
    }

    return {
      success: true,
      messageId: data?.data?.id || data?.id,
      recipient: formattedPhone,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return {
        success: false,
        recipient: formattedPhone,
        error: "Serverga ulanish vaqti tugadi (Timeout). Internet aloqasini tekshiring.",
      };
    }
    return {
      success: false,
      recipient: formattedPhone,
      error: err.message || "Tarmoq xatosi",
    };
  }
}

/**
 * Tashrif eslatmasi uchun rasmiy SMS shablon:
 * "Assalomu alaykum, [Otkirbay Kalbaev]! Dr.Bayniyazov stomatologiya klinikasida [next_visit_date] da shifokor [Ataniyaz Bayniyazov] qabuliga yozilgansiz. Sizni kutamiz!"
 */
export function generateAppointmentSmsText({
  patientName,
  nextVisitDate,
  doctorName,
}: {
  patientName: string;
  nextVisitDate: string;
  doctorName?: string;
}): string {
  const doc = doctorName ? doctorName : "Ataniyaz Bayniyazov";
  return `Assalomu alaykum, ${patientName}! Dr.Bayniyazov stomatologiya klinikasida ${nextVisitDate} da shifokor ${doc} qabuliga yozilgansiz. Sizni kutamiz!`;
}

/**
 * Tug'ilgan kun tabrigi va 10% chegirma shabloni:
 */
export function generateBirthdaySmsText({
  patientName,
}: {
  patientName: string;
}): string {
  return `Hurmatli ${patientName}! Dr.Bayniyazov stomatologiya klinikasi jamoasi sizni ertangi tavallud ayyomingiz bilan chin dildan muborakbod etadi! Sizga mustahkam sog'liq va yorqin tabassum tilaymiz. Tug'ilgan kuningiz munosabati bilan barcha stomatologik xizmatlarimizga 10% chegirmadan foydalanishingiz mumkin!`;
}
