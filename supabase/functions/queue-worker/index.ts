import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json().catch(() => ({}));
    const { action, campaign_id, company_id, batch_size = 10 } = body;

    // ACTION: enqueue - Create queue entries from campaign contacts
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

      // Spintax resolver
      const resolveSpintax = (text: string) => text.replace(/\{([^{}]+)\}/g, (_, group: string) => {
        const options = group.split('|');
        return options[Math.floor(Math.random() * options.length)];
      });

      // Distribute contacts evenly across instances (round-robin)
      const queueEntries = contacts.map((phone, i) => ({
        company_id,
        campaign_id,
        instance_id: instanceIds[i % instanceIds.length],
        phone,
        message: useSpintax ? resolveSpintax(campaign.message_template) : campaign.message_template,
        status: 'pending',
        scheduled_at: new Date().toISOString(),
      }));

      // Insert in batches of 500
      const BATCH_SIZE = 500;
      for (let i = 0; i < queueEntries.length; i += BATCH_SIZE) {
        const batch = queueEntries.slice(i, i + BATCH_SIZE);
        await supabase.from('message_queue').insert(batch);
      }

      // Update campaign status
      await supabase.from('campaigns').update({ status: 'sending' }).eq('id', campaign_id);

      // Ensure instance_limits exist
      for (const instId of instanceIds) {
        await supabase.from('instance_limits').upsert(
          { instance_id: instId },
          { onConflict: 'instance_id' }
        );
      }

      return new Response(JSON.stringify({ queued: queueEntries.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ACTION: process - Process pending messages from queue
    if (action === 'process') {
      if (!campaign_id) {
        return new Response(JSON.stringify({ error: 'campaign_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Check if campaign is still sending (not paused)
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('status, segment_data')
        .eq('id', campaign_id)
        .single();

      if (!campaign || campaign.status !== 'sending') {
        return new Response(JSON.stringify({ processed: 0, reason: 'Campaign not in sending state' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const segData = campaign.segment_data as any || {};
      const delayMin = segData.delay_min || 3;
      const delayMax = segData.delay_max || 8;

      // Fetch pending messages
      const { data: pending } = await supabase
        .from('message_queue')
        .select('*, instances(name, status, evolution_instance_id)')
        .eq('campaign_id', campaign_id)
        .eq('status', 'pending')
        .lte('scheduled_at', new Date().toISOString())
        .order('created_at')
        .limit(batch_size);

      if (!pending || pending.length === 0) {
        // Check if all done
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

      for (const msg of pending) {
        const instance = (msg as any).instances;

        // Check instance availability - fallback if offline
        if (!instance || instance.status !== 'online') {
          // Find alternative instance
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
              status: 'failed',
              error: 'No available instances',
              attempts: msg.attempts + 1,
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

          // Reset counters if needed
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

          // Check cooldown
          if (limits.cooldown_until && new Date(limits.cooldown_until) > now) {
            continue; // Skip this instance, it's cooling down
          }

          // Check limits
          if (currentMinute >= limits.max_per_minute || currentHour >= limits.max_per_hour || currentDay >= limits.max_per_day) {
            // Enter cooldown (15 min)
            await supabase.from('instance_limits').update({
              cooldown_until: new Date(now.getTime() + 15 * 60000).toISOString(),
            }).eq('id', limits.id);
            continue;
          }
        }

        // Mark as processing
        await supabase.from('message_queue').update({ status: 'processing' }).eq('id', msg.id);

        // Simulate send (in production, call Evolution API here)
        // Random delay simulation
        const delay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
        await new Promise(resolve => setTimeout(resolve, delay * 100)); // reduced for edge function

        // Mark as sent
        const sentAt = new Date().toISOString();
        await supabase.from('message_queue').update({
          status: 'sent',
          sent_at: sentAt,
          attempts: msg.attempts + 1,
        }).eq('id', msg.id);

        // Update instance limits
        if (limits) {
          await supabase.from('instance_limits').update({
            messages_sent_minute: limits.messages_sent_minute + 1,
            messages_sent_hour: limits.messages_sent_hour + 1,
            messages_sent_day: limits.messages_sent_day + 1,
          }).eq('id', limits.id);
        }

        // Log to messages_log
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

    // ACTION: stats - Get queue stats
    if (action === 'stats') {
      if (!campaign_id) {
        return new Response(JSON.stringify({ error: 'campaign_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const [pending, processing, sent, failedQ, blocked] = await Promise.all([
        supabase.from('message_queue').select('id', { count: 'exact', head: true }).eq('campaign_id', campaign_id).eq('status', 'pending'),
        supabase.from('message_queue').select('id', { count: 'exact', head: true }).eq('campaign_id', campaign_id).eq('status', 'processing'),
        supabase.from('message_queue').select('id', { count: 'exact', head: true }).eq('campaign_id', campaign_id).eq('status', 'sent'),
        supabase.from('message_queue').select('id', { count: 'exact', head: true }).eq('campaign_id', campaign_id).eq('status', 'failed'),
        supabase.from('message_queue').select('id', { count: 'exact', head: true }).eq('campaign_id', campaign_id).eq('status', 'blocked'),
      ]);

      const total = (pending.count || 0) + (processing.count || 0) + (sent.count || 0) + (failedQ.count || 0) + (blocked.count || 0);
      const failRate = total > 0 ? ((failedQ.count || 0) / total) * 100 : 0;

      let risk = 'baixo';
      if (failRate > 10) risk = 'alto';
      else if (failRate > 5) risk = 'moderado';

      return new Response(JSON.stringify({
        pending: pending.count || 0,
        processing: processing.count || 0,
        sent: sent.count || 0,
        failed: failedQ.count || 0,
        blocked: blocked.count || 0,
        total,
        fail_rate: failRate,
        risk,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
