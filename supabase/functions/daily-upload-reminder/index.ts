import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ParticipantToRemind {
  participant_id: string;
  user_id: string;
  event_id: string;
  event_title: string;
  push_token: string;
}

function isNineAM(timezone: string): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    const hour = parseInt(formatter.format(now), 10);
    return hour === 9;
  } catch {
    return false;
  }
}

async function sendExpoPushNotifications(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<boolean> {
  if (tokens.length === 0) return true;

  const messages = tokens.map((token) => ({
    to: token,
    title,
    body,
    data,
  }));

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.error("Push notification failed:", await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error("Push notification error:", error);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const results = {
      eventsChecked: 0,
      eventsAtNineAM: 0,
      participantsFound: 0,
      notificationsSent: 0,
      errors: [] as string[],
    };

    const { data: activeEvents, error: eventsError } = await supabase
      .from("events")
      .select("id, title, timezone")
      .in("status", ["live", "ended"])
      .gt("expires_at", new Date().toISOString());

    if (eventsError) {
      throw new Error(`Failed to fetch events: ${eventsError.message}`);
    }

    if (!activeEvents || activeEvents.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No active events found",
          results,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    results.eventsChecked = activeEvents.length;

    const eventsAtNineAM = activeEvents.filter((event) =>
      isNineAM(event.timezone),
    );
    results.eventsAtNineAM = eventsAtNineAM.length;

    if (eventsAtNineAM.length === 0) {
      console.log(
        `Checked ${activeEvents.length} events, none are at 09:00 local time`,
      );
      return new Response(
        JSON.stringify({
          success: true,
          message: "No events at 09:00 local time",
          results,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const eventIds = eventsAtNineAM.map((e) => e.id);
    const eventTitleMap = new Map(eventsAtNineAM.map((e) => [e.id, e.title]));

    const twentyHoursAgo = new Date(
      Date.now() - 20 * 60 * 60 * 1000,
    ).toISOString();

    const { data: participantsToRemind, error: participantsError } =
      await supabase
        .from("event_participants")
        .select(
          `
        id,
        user_id,
        event_id,
        last_reminder_sent_at,
        users!inner(push_token)
      `,
        )
        .in("event_id", eventIds)
        .eq("no_photos_to_upload", false)
        .or(`last_reminder_sent_at.is.null,last_reminder_sent_at.lt.${twentyHoursAgo}`);

    if (participantsError) {
      throw new Error(
        `Failed to fetch participants: ${participantsError.message}`,
      );
    }

    if (!participantsToRemind || participantsToRemind.length === 0) {
      console.log("No participants match criteria");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No participants need reminders",
          results,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const participantIds = participantsToRemind.map((p) => p.id);
    const userIds = participantsToRemind.map((p) => p.user_id);

    const { data: mediaItems, error: mediaError } = await supabase
      .from("media_items")
      .select("uploaded_by_user_id, event_id")
      .in("event_id", eventIds)
      .in("uploaded_by_user_id", userIds);

    if (mediaError) {
      results.errors.push(`Failed to fetch media items: ${mediaError.message}`);
    }

    const uploadedSet = new Set(
      (mediaItems || []).map(
        (m) => `${m.event_id}:${m.uploaded_by_user_id}`,
      ),
    );

    const participantsWithNoUploads: ParticipantToRemind[] = participantsToRemind
      .filter((p) => {
        const key = `${p.event_id}:${p.user_id}`;
        const hasUploaded = uploadedSet.has(key);
        const pushToken = (p.users as { push_token: string | null })?.push_token;
        return !hasUploaded && pushToken;
      })
      .map((p) => ({
        participant_id: p.id,
        user_id: p.user_id,
        event_id: p.event_id,
        event_title: eventTitleMap.get(p.event_id) || "Event",
        push_token: (p.users as { push_token: string })?.push_token,
      }));

    results.participantsFound = participantsWithNoUploads.length;

    if (participantsWithNoUploads.length === 0) {
      console.log("All participants have uploaded photos or lack push tokens");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No reminders needed",
          results,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const participantsByUser = new Map<
      string,
      { token: string; events: { id: string; title: string; participantId: string }[] }
    >();

    for (const p of participantsWithNoUploads) {
      const existing = participantsByUser.get(p.user_id);
      if (existing) {
        existing.events.push({
          id: p.event_id,
          title: p.event_title,
          participantId: p.participant_id,
        });
      } else {
        participantsByUser.set(p.user_id, {
          token: p.push_token,
          events: [{ id: p.event_id, title: p.event_title, participantId: p.participant_id }],
        });
      }
    }

    const participantIdsToUpdate: string[] = [];

    for (const [userId, userData] of participantsByUser) {
      const eventTitles = userData.events.map((e) => e.title);
      const title =
        eventTitles.length === 1 ? eventTitles[0] : `${eventTitles.length} Events`;
      const body =
        eventTitles.length === 1
          ? "Your friends are waiting! Upload your photos from the event."
          : `Your friends are waiting! Upload your photos from ${eventTitles.join(", ")}.`;

      const success = await sendExpoPushNotifications([userData.token], title, body, {
        type: "upload_reminder",
        eventIds: userData.events.map((e) => e.id),
      });

      if (success) {
        results.notificationsSent++;
        participantIdsToUpdate.push(
          ...userData.events.map((e) => e.participantId),
        );
      } else {
        results.errors.push(`Failed to send notification to user ${userId}`);
      }
    }

    if (participantIdsToUpdate.length > 0) {
      const { error: updateError } = await supabase
        .from("event_participants")
        .update({ last_reminder_sent_at: new Date().toISOString() })
        .in("id", participantIdsToUpdate);

      if (updateError) {
        results.errors.push(
          `Failed to update last_reminder_sent_at: ${updateError.message}`,
        );
      }
    }

    console.log(
      `Sent ${results.notificationsSent} reminders to ${participantsByUser.size} users`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sent ${results.notificationsSent} reminder(s)`,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Daily reminder error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
