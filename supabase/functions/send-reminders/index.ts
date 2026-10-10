import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// httpsms orqali SMS yuborish
async function sendViaHttpSms(toPhone: string, message: string) {
  const apiKey = Deno.env.get('HTTPSMS_API_KEY') || 'uk_d0Rz57nSH0U49wN6ixxlhH-k3Q_urnIkH-qPaIL5R2LrgdhmM7Sd3APk2OI507BQ';
  const fromNumber = Deno.env.get('HTTPSMS_FROM_NUMBER');

  if (!apiKey) {
    console.log(`[HTTPSMS SIMULATION] To: ${toPhone} | Message: ${message}`);
    return { success: true, simulated: true };
  }

  // O'zbekiston raqamini formatlash (+998...)
  let cleanPhone = toPhone.replace(/\D/g, '');
  if (!cleanPhone.startsWith('998') && cleanPhone.length === 9) cleanPhone = '998' + cleanPhone;
  if (!cleanPhone.startsWith('+')) cleanPhone = '+' + cleanPhone;

  const payload: Record<string, string> = {
    content: message,
    to: cleanPhone,
  };
  if (fromNumber) {
    payload.from = fromNumber;
  }

  const res = await fetch('https://api.httpsms.com/v1/messages/send', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`HttpSms xatosi (${res.status}): ${errorText}`);
  }

  return await res.json();
}

// Telegram Bot orqali xabar yuborish
async function sendViaTelegram(chatId: string | null, message: string) {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const defaultChatId = Deno.env.get('TELEGRAM_DEFAULT_CHAT_ID');
  const targetChatId = chatId || defaultChatId;

  if (!botToken || !targetChatId) {
    console.log(`[TELEGRAM SIMULATION] Chat: ${targetChatId || 'NoChat'} | Message: ${message}`);
    return { success: true, simulated: true };
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: targetChatId,
      text: message,
      parse_mode: 'HTML',
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Telegram xatosi (${res.status}): ${errorText}`);
  }

  return await res.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const nowIso = now.toISOString();

    // 1. REJALI ESLATMALARNI YARATISH (24 soat va 2 soat oldin)
    // 24 soat oldin: 23-25 soat oralig'idagi qabullar
    const in24hStart = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString();
    const in24hEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString();

    // 2 soat oldin: 1.5 - 2.5 soat oralig'idagi qabullar
    const in2hStart = new Date(now.getTime() + 90 * 60 * 1000).toISOString();
    const in2hEnd = new Date(now.getTime() + 150 * 60 * 1000).toISOString();

    // Yaqinlashayotgan qabullarni olish
    const { data: upcomingOrders } = await supabase
      .from('visit_orders')
      .select('id, patient_id, visit_datetime, status, patients(full_name, phone)')
      .in('status', ['NEW', 'SENT_TO_DOCTOR'])
      .or(`and(visit_datetime.gte.${in24hStart},visit_datetime.lte.${in24hEnd}),and(visit_datetime.gte.${in2hStart},visit_datetime.lte.${in2hEnd})`);

    for (const order of upcomingOrders || []) {
      const orderTime = new Date(order.visit_datetime);
      const hoursLeft = Math.round((orderTime.getTime() - now.getTime()) / (1000 * 60 * 60));
      const reminderType = hoursLeft >= 12 ? '24h' : '2h';
      const formattedTime = orderTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const formattedDate = orderTime.toLocaleDateString('uz-UZ');

      const message = hoursLeft >= 12
        ? `Hurmatli ${order.patients?.full_name}, ertaga soat ${formattedTime} da StomaCRM klinikasida qabulingiz borligini eslatamiz. Manzil: Klinika binosi.`
        : `Hurmatli ${order.patients?.full_name}, bugun soat ${formattedTime} da shifokor qabulingizga 2 soat qoldi. Sizni kutamiz!`;

      // Tekshirish: bu buyurtma uchun allaqachon xuddi shu turdagi eslatma yuborilmaganmi?
      const { data: existing } = await supabase
        .from('reminders')
        .select('id')
        .eq('visit_order_id', order.id)
        .like('message', `%${hoursLeft >= 12 ? 'ertaga' : '2 soat'}%`)
        .maybeSingle();

      if (!existing) {
        await supabase.from('reminders').insert({
          visit_order_id: order.id,
          patient_id: order.patient_id,
          channel: 'sms',
          message: message,
          remind_at: nowIso,
          status: 'pending',
        });
      }
    }

    // 2. QARZDORLIK ESLATMALARINI YARATISH (Qarzi bor va oxirgi 7 kunda eslatma olmaganlar)
    const { data: debtOrders } = await supabase
      .from('visit_orders')
      .select('id, patient_id, debt_amount, patients(full_name, phone)')
      .gt('debt_amount', 0)
      .limit(20);

    for (const dOrder of debtOrders || []) {
      const debtAmountFormatted = Number(dOrder.debt_amount).toLocaleString();
      const message = `Hurmatli ${dOrder.patients?.full_name}, StomaCRM klinikasidagi davolanish bo'yicha qarzingiz ${debtAmountFormatted} so'm. To'lovni amalga oshirishingizni so'raymiz.`;

      // 7 kun ichida yuborilganmi tekshirish
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentDebtReminder } = await supabase
        .from('reminders')
        .select('id')
        .eq('patient_id', dOrder.patient_id)
        .like('message', '%qarzingiz%')
        .gte('created_at', weekAgo)
        .maybeSingle();

      if (!recentDebtReminder) {
        await supabase.from('reminders').insert({
          visit_order_id: dOrder.id,
          patient_id: dOrder.patient_id,
          channel: 'sms',
          message: message,
          remind_at: nowIso,
          status: 'pending',
        });
      }
    }

    // 3. PENDING (KUTILAYOTGAN) ESLATMALARNI YUBORISH
    const { data: pendingReminders, error: fetchErr } = await supabase
      .from('reminders')
      .select(`
        *,
        patients(full_name, phone)
      `)
      .eq('status', 'pending')
      .lte('remind_at', nowIso)
      .limit(50);

    if (fetchErr) throw fetchErr;

    const results: any[] = [];

    for (const reminder of pendingReminders || []) {
      try {
        const phone = reminder.patients?.phone || '';
        if (reminder.channel === 'telegram') {
          await sendViaTelegram(null, `📢 <b>StomaCRM Eslatma</b>\n\n${reminder.message}`);
        } else {
          // Asosiy kanal - SMS (httpsms)
          await sendViaHttpSms(phone, reminder.message);
        }

        // Muvaffaqiyatli deb belgilash
        await supabase
          .from('reminders')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', reminder.id);

        results.push({ id: reminder.id, status: 'sent', recipient: phone });
      } catch (err: any) {
        console.error(`Eslatma yuborishda xatolik (${reminder.id}):`, err);
        await supabase
          .from('reminders')
          .update({ status: 'failed' })
          .eq('id', reminder.id);

        results.push({ id: reminder.id, status: 'failed', error: err.message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
