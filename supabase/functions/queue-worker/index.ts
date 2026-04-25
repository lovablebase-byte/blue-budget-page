import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Human behavior helpers
function calcTypingDelay(messageLength: number, speedMin: number, speedMax: number): number {
  const speed = speedMin + Math.random() * (speedMax - speedMin);
  return (messageLength / speed) * 1000; // ms
}

function calcHumanPause(pauseMin: number, pauseMax: number): number {
  return (pauseMin + Math.random() * (pauseMax - pauseMin)) * 1000; // ms
}

function calcBurstCooldown(cooldownMin: number, cooldownMax: number): number {
  return (cooldownMin + Math.random() * (cooldownMax - cooldownMin)) * 1000; // ms
}

function getInstanceVariation(instanceIndex: number): { pauseMin: number; pauseMax: number } {
  // Each instance gets a unique rhythm offset based on index
  const baseMin = 8 + (instanceIndex * 2);
  const baseMax = 18 + (instanceIndex * 3);
  return { pauseMin: baseMin, pauseMax: Math.min(baseMax, 35) };
}

async function resolveProviderConfig(
  supabase: any,
  companyId: string,
  provider: string,
): Promise<{ baseUrl: string; apiKey: string } | null> {
  const { data: cfg } = await supabase
    .from('whatsapp_api_configs')
    .select('base_url, api_key, is_active')
    .eq('company_id', companyId)
    .eq('provider', provider)
    .maybeSingle();
  if (cfg?.is_active && cfg.base_url) {
    return { baseUrl: cfg.base_url.replace(/\/+$/, ''), apiKey: cfg.api_key || '' };
  }
  if (provider === 'evolution') {
    const { data: legacy } = await supabase
      .from('evolution_api_config')
      .select('base_url, api_key, is_active')
      .eq('company_id', companyId)
      .maybeSingle();
    if (legacy?.is_active && legacy.base_url) {
      return { baseUrl: legacy.base_url.replace(/\/+$/, ''), apiKey: legacy.api_key || '' };
    }
  }
  return null;
}

async function wppGenerateTokenLocal(baseUrl: string, secretKey: string, session: string): Promise<string | null> {
  try {
    const r = await fetch(`${baseUrl}/api/${encodeURIComponent(session)}/${encodeURIComponent(secretKey)}/generate-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await r.json().catch(() => ({}));
    return data?.token || data?.full || null;
  } catch {
    return null;
  }
}

async function sendViaProvider(
  supabase: any,
  instance: { id: string; name: string; company_id: string; provider: string; provider_instance_id: string | null; evolution_instance_id: string | null },
  phone: string,
  text: string,
  opts?: { typingMs?: number },
): Promise<{ ok: boolean; status: number; response: any; provider: string }> {
  const provider = instance.provider || 'evolution';
  const cfg = await resolveProviderConfig(supabase, instance.company_id, provider);
  if (!cfg) return { ok: false, status: 400, response: { error: `Provider '${provider}' não configurado` }, provider };
  const { baseUrl, apiKey } = cfg;
  const phoneDigits = phone.replace(/\D/g, '');
  try {
    if (provider === 'evolution') {
      const evoName = instance.evolution_instance_id || instance.name;
      // Best-effort presence (typing) for Evolution only
      if (opts?.typingMs) {
        try {
          await fetch(`${baseUrl}/chat/updatePresence/${evoName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: apiKey },
            body: JSON.stringify({ number: phoneDigits, presence: 'composing', delay: Math.round(opts.typingMs) }),
          });
        } catch (_) { /* best-effort */ }
      }
      const res = await fetch(`${baseUrl}/message/sendText/${evoName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ number: phoneDigits, text }),
      });
      const data = await res.json().catch(() => ({ status: res.status }));
      return { ok: res.ok, status: res.status, response: data, provider };
    }
    if (provider === 'evolution_go') {
      const instanceToken = instance.provider_instance_id || '';
      if (!instanceToken) return { ok: false, status: 400, response: { error: 'Token Evolution Go ausente' }, provider };
      const res = await fetch(`${baseUrl}/send/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: instanceToken },
        body: JSON.stringify({ number: phoneDigits, text }),
      });
      const data = await res.json().catch(() => ({ status: res.status }));
      return { ok: res.ok, status: res.status, response: data, provider };
    }
    if (provider === 'wuzapi') {
      const userToken = instance.provider_instance_id || '';
      if (!userToken) return { ok: false, status: 400, response: { error: 'Token Wuzapi ausente' }, provider };
      const res = await fetch(`${baseUrl}/chat/send/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Token: userToken },
        body: JSON.stringify({ Phone: phoneDigits, Body: text }),
      });
      const data = await res.json().catch(() => ({ status: res.status }));
      return { ok: res.ok, status: res.status, response: data, provider };
    }
    if (provider === 'wppconnect') {
      const session = instance.name;
      const sessionToken = await wppGenerateTokenLocal(baseUrl, apiKey, session);
      if (!sessionToken) return { ok: false, status: 401, response: { error: 'WPPConnect: token de sessão indisponível' }, provider };
      const res = await fetch(`${baseUrl}/api/${encodeURIComponent(session)}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ phone: phoneDigits, isGroup: false, isNewsletter: false, isLid: false, message: text }),
      });
      const data = await res.json().catch(() => ({ status: res.status }));
      return { ok: res.ok, status: res.status, response: data, provider };
    }
    if (provider === 'quepasa') {
      const sessionToken = instance.provider_instance_id || apiKey;
      const res = await fetch(`${baseUrl}/send`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-QUEPASA-TOKEN': sessionToken,
          'X-QUEPASA-CHATID': phoneDigits.includes('@') ? phoneDigits : `${phoneDigits}@s.whatsapp.net`,
          'X-QUEPASA-TRACKID': instance.name,
        },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({ status: res.status }));
      return { ok: res.ok, status: res.status, response: data, provider };
    }
    return { ok: false, status: 400, response: { error: `Provider desconhecido: ${provider}` }, provider };
  } catch (err: any) {
    return { ok: false, status: 500, response: { error: err.message }, provider };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json().catch(() => ({}));
    const { action, campaign_id, company_id, batch_size = 10 } = body;

    // Helper: fetch human behavior config for a company
    async function getHumanConfig(cid: string) {
      const { data } = await supabase
        .from('human_behavior_config')
        .select('*')
        .eq('company_id', cid)
        .single();
      return data || {
        typing_simulation_enabled: true,
        typing_speed_min: 3,
        typing_speed_max: 7,
        human_pause_min: 8,
        human_pause_max: 25,
        burst_limit: 20,
        cooldown_after_burst_min: 120,
        cooldown_after_burst_max: 300,
      };
    }

    // ACTION: enqueue
    if (action === 'enqueue') {
      if (!campaign_id || !company_id) {
        return new Response(JSON.stringify({ error: 'campaign_id and company_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: campaign, error: campErr } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaign_id)
        .single();
      if (campErr || !campaign) {
        return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const segData = campaign.segment_data as any || {};
      const contacts: string[] = segData.contacts || [];
      const instanceIds: string[] = segData.instances || [];
      const useSpintax = segData.use_spintax !== false;

      if (contacts.length === 0 || instanceIds.length === 0) {
        return new Response(JSON.stringify({ error: 'No contacts or instances' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const resolveSpintax = (text: string) => text.replace(/\{([^{}]+)\}/g, (_, group: string) => {
        const options = group.split('|');
        return options[Math.floor(Math.random() * options.length)];
      });

      const queueEntries = contacts.map((phone, i) => ({
        company_id,
        campaign_id,
        instance_id: instanceIds[i % instanceIds.length],
        phone,
        message: useSpintax ? resolveSpintax(campaign.message_template) : campaign.message_template,
        status: 'pending',
        scheduled_at: new Date().toISOString(),
      }));

      const BATCH_SIZE = 500;
      for (let i = 0; i < queueEntries.length; i += BATCH_SIZE) {
        await supabase.from('message_queue').insert(queueEntries.slice(i, i + BATCH_SIZE));
      }

      await supabase.from('campaigns').update({ status: 'sending' }).eq('id', campaign_id);

      for (const instId of instanceIds) {
        await supabase.from('instance_limits').upsert({ instance_id: instId }, { onConflict: 'instance_id' });
      }

      return new Response(JSON.stringify({ queued: queueEntries.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ACTION: process
    if (action === 'process') {
      if (!campaign_id) {
        return new Response(JSON.stringify({ error: 'campaign_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: campaign } = await supabase
        .from('campaigns')
        .select('status, segment_data, company_id')
        .eq('id', campaign_id)
        .single();

      if (!campaign || campaign.status !== 'sending') {
        return new Response(JSON.stringify({ processed: 0, reason: 'Campaign not in sending state' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Load human behavior config
      const hb = await getHumanConfig(campaign.company_id);
      const segData = campaign.segment_data as any || {};
      const humanModeEnabled = segData.human_mode !== false;

      const { data: pending } = await supabase
        .from('message_queue')
        .select('*, instances(name, status, evolution_instance_id)')
        .eq('campaign_id', campaign_id)
        .eq('status', 'pending')
        .lte('scheduled_at', new Date().toISOString())
        .order('created_at')
        .limit(batch_size);

      if (!pending || pending.length === 0) {
        const { count: remainingCount } = await supabase
          .from('message_queue')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaign_id)
          .in('status', ['pending', 'processing']);

        if (remainingCount === 0) {
          await supabase.from('campaigns').update({ status: 'completed' }).eq('id', campaign_id);
        }

        return new Response(JSON.stringify({ processed: 0, remaining: remainingCount || 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      let processed = 0;
      let failed = 0;
      let burstCount = 0;
      let totalTypingDelay = 0;
      let totalPauseDelay = 0;
      let pausesApplied = 0;

      // Build instance index map for per-instance variation
      const instanceIndexMap = new Map<string, number>();
      let idxCounter = 0;

      for (const msg of pending) {
        const instance = (msg as any).instances;

        // Instance fallback
        if (!instance || instance.status !== 'online') {
          const { data: altInstances } = await supabase
            .from('instances')
            .select('id')
            .eq('company_id', msg.company_id)
            .eq('status', 'online')
            .limit(1);

          if (altInstances && altInstances.length > 0) {
            await supabase.from('message_queue').update({ instance_id: altInstances[0].id }).eq('id', msg.id);
          } else {
            await supabase.from('message_queue').update({
              status: 'failed', error: 'No available instances', attempts: msg.attempts + 1,
            }).eq('id', msg.id);
            failed++;
            continue;
          }
        }

        // Check instance limits
        const { data: limits } = await supabase
          .from('instance_limits')
          .select('*')
          .eq('instance_id', msg.instance_id)
          .single();

        if (limits) {
          const now = new Date();
          const resetMinute = new Date(limits.last_reset_minute).getTime() + 60000 < now.getTime();
          const resetHour = new Date(limits.last_reset_hour).getTime() + 3600000 < now.getTime();
          const resetDay = new Date(limits.last_reset_day).getTime() + 86400000 < now.getTime();

          const updates: any = {};
          if (resetMinute) { updates.messages_sent_minute = 0; updates.last_reset_minute = now.toISOString(); }
          if (resetHour) { updates.messages_sent_hour = 0; updates.last_reset_hour = now.toISOString(); }
          if (resetDay) { updates.messages_sent_day = 0; updates.last_reset_day = now.toISOString(); }
          if (Object.keys(updates).length > 0) {
            await supabase.from('instance_limits').update(updates).eq('id', limits.id);
          }

          const currentMinute = resetMinute ? 0 : limits.messages_sent_minute;
          const currentHour = resetHour ? 0 : limits.messages_sent_hour;
          const currentDay = resetDay ? 0 : limits.messages_sent_day;

          if (limits.cooldown_until && new Date(limits.cooldown_until) > now) continue;

          if (currentMinute >= limits.max_per_minute || currentHour >= limits.max_per_hour || currentDay >= limits.max_per_day) {
            await supabase.from('instance_limits').update({
              cooldown_until: new Date(now.getTime() + 15 * 60000).toISOString(),
            }).eq('id', limits.id);
            continue;
          }
        }

        // Mark as processing
        await supabase.from('message_queue').update({ status: 'processing' }).eq('id', msg.id);

        // ===== HUMAN BEHAVIOR ENGINE =====
        if (humanModeEnabled && hb.typing_simulation_enabled) {
          // 1. Typing simulation delay
          const typingMs = calcTypingDelay(
            (msg.message || '').length,
            Number(hb.typing_speed_min),
            Number(hb.typing_speed_max)
          );
          totalTypingDelay += typingMs;
          // In edge function we cap to avoid timeout, scale down by 10x
          await new Promise(r => setTimeout(r, Math.min(typingMs / 10, 500)));
        }

        if (humanModeEnabled) {
          // 2. Per-instance variation pause
          if (!instanceIndexMap.has(msg.instance_id)) {
            instanceIndexMap.set(msg.instance_id, idxCounter++);
          }
          const instIdx = instanceIndexMap.get(msg.instance_id)!;
          const variation = getInstanceVariation(instIdx);

          const pauseMin = Math.max(variation.pauseMin, hb.human_pause_min);
          const pauseMax = Math.max(variation.pauseMax, hb.human_pause_max);
          const pauseMs = calcHumanPause(pauseMin, pauseMax);
          totalPauseDelay += pauseMs;
          pausesApplied++;
          // Scale down for edge function
          await new Promise(r => setTimeout(r, Math.min(pauseMs / 10, 800)));

          // 3. Burst cooldown
          burstCount++;
          if (burstCount >= hb.burst_limit) {
            const cooldownMs = calcBurstCooldown(hb.cooldown_after_burst_min, hb.cooldown_after_burst_max);
            // Scale down for edge function
            await new Promise(r => setTimeout(r, Math.min(cooldownMs / 50, 2000)));
            burstCount = 0;
          }
        }

        // === Send via Evolution API with typing indicator ===
        const instanceRecord = instance || (msg as any).instances;
        const evoInstanceName = instanceRecord?.evolution_instance_id || instanceRecord?.name;

        if (evoInstanceName) {
          // Fetch Evolution API config for the company
          const { data: evoConfig } = await supabase
            .from('evolution_api_config')
            .select('base_url, api_key, is_active')
            .eq('company_id', msg.company_id)
            .single();

          if (evoConfig?.is_active && evoConfig.base_url && evoConfig.api_key) {
            const evoBase = evoConfig.base_url.replace(/\/+$/, '');
            const evoHeaders = { 'Content-Type': 'application/json', apikey: evoConfig.api_key };

            // 1. Send "composing" presence (typing indicator)
            if (humanModeEnabled && hb.typing_simulation_enabled) {
              const typingDuration = Math.min(
                calcTypingDelay((msg.message || '').length, Number(hb.typing_speed_min), Number(hb.typing_speed_max)),
                15000
              );
              try {
                await fetch(`${evoBase}/chat/updatePresence/${evoInstanceName}`, {
                  method: 'POST',
                  headers: evoHeaders,
                  body: JSON.stringify({
                    number: msg.phone,
                    presence: 'composing',
                    delay: Math.round(typingDuration),
                  }),
                });
                // Wait for part of the typing duration
                await new Promise(r => setTimeout(r, Math.min(typingDuration / 5, 3000)));
              } catch (_) { /* typing is best-effort */ }
            }

            // 2. Send the actual message
            try {
              const sendRes = await fetch(`${evoBase}/message/sendText/${evoInstanceName}`, {
                method: 'POST',
                headers: evoHeaders,
                body: JSON.stringify({
                  number: msg.phone,
                  text: msg.message,
                }),
              });
              if (!sendRes.ok) {
                const errData = await sendRes.json().catch(() => ({}));
                throw new Error(errData.message || `HTTP ${sendRes.status}`);
              }
            } catch (sendErr: any) {
              await supabase.from('message_queue').update({
                status: 'failed', error: sendErr.message, attempts: msg.attempts + 1,
              }).eq('id', msg.id);
              failed++;
              continue;
            }
          }
        }

        const sentAt = new Date().toISOString();
        await supabase.from('message_queue').update({
          status: 'sent', sent_at: sentAt, attempts: msg.attempts + 1,
        }).eq('id', msg.id);

        // Update instance limits
        if (limits) {
          await supabase.from('instance_limits').update({
            messages_sent_minute: limits.messages_sent_minute + 1,
            messages_sent_hour: limits.messages_sent_hour + 1,
            messages_sent_day: limits.messages_sent_day + 1,
          }).eq('id', limits.id);
        }

        // Log
        await supabase.from('messages_log').insert({
          company_id: msg.company_id,
          instance_id: msg.instance_id,
          contact_number: msg.phone,
          direction: 'outgoing',
          message: msg.message,
          media_url: msg.media_url,
          status: 'sent',
          campaign_id: msg.campaign_id,
          sent_at: sentAt,
        });

        processed++;
      }

      // Update campaign stats
      const [sentRes, failedRes, deliveredRes] = await Promise.all([
        supabase.from('message_queue').select('id', { count: 'exact', head: true }).eq('campaign_id', campaign_id).eq('status', 'sent'),
        supabase.from('message_queue').select('id', { count: 'exact', head: true }).eq('campaign_id', campaign_id).eq('status', 'failed'),
        supabase.from('message_queue').select('id', { count: 'exact', head: true }).eq('campaign_id', campaign_id).in('status', ['sent', 'delivered']),
      ]);

      await supabase.from('campaigns').update({
        stats: {
          sent: sentRes.count || 0,
          failed: failedRes.count || 0,
          delivered: deliveredRes.count || 0,
          read: 0,
          human_behavior: humanModeEnabled ? {
            avg_typing_delay: processed > 0 ? Math.round(totalTypingDelay / processed) : 0,
            avg_pause_delay: pausesApplied > 0 ? Math.round(totalPauseDelay / pausesApplied) : 0,
            pauses_applied: pausesApplied,
          } : null,
        },
      }).eq('id', campaign_id);

      return new Response(JSON.stringify({ processed, failed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ACTION: pause
    if (action === 'pause') {
      if (!campaign_id) {
        return new Response(JSON.stringify({ error: 'campaign_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      await supabase.from('campaigns').update({ status: 'paused' }).eq('id', campaign_id);
      return new Response(JSON.stringify({ paused: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ACTION: stats
    if (action === 'stats') {
      if (!campaign_id) {
        return new Response(JSON.stringify({ error: 'campaign_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const [pending, processing, sent, failedQ, blocked, campaignData] = await Promise.all([
        supabase.from('message_queue').select('id', { count: 'exact', head: true }).eq('campaign_id', campaign_id).eq('status', 'pending'),
        supabase.from('message_queue').select('id', { count: 'exact', head: true }).eq('campaign_id', campaign_id).eq('status', 'processing'),
        supabase.from('message_queue').select('id', { count: 'exact', head: true }).eq('campaign_id', campaign_id).eq('status', 'sent'),
        supabase.from('message_queue').select('id', { count: 'exact', head: true }).eq('campaign_id', campaign_id).eq('status', 'failed'),
        supabase.from('message_queue').select('id', { count: 'exact', head: true }).eq('campaign_id', campaign_id).eq('status', 'blocked'),
        supabase.from('campaigns').select('stats, segment_data').eq('id', campaign_id).single(),
      ]);

      const total = (pending.count || 0) + (processing.count || 0) + (sent.count || 0) + (failedQ.count || 0) + (blocked.count || 0);
      const failRate = total > 0 ? ((failedQ.count || 0) / total) * 100 : 0;

      let risk = 'baixo';
      if (failRate > 10) risk = 'alto';
      else if (failRate > 5) risk = 'moderado';

      const stats = (campaignData?.data?.stats as any) || {};
      const segData = (campaignData?.data?.segment_data as any) || {};

      return new Response(JSON.stringify({
        pending: pending.count || 0,
        processing: processing.count || 0,
        sent: sent.count || 0,
        failed: failedQ.count || 0,
        blocked: blocked.count || 0,
        total,
        fail_rate: failRate,
        risk,
        human_mode: segData.human_mode !== false,
        human_behavior: stats.human_behavior || null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
