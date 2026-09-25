import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { projectId, projectName, todaySpend, dailyBudget } = await req.json();

    console.log(`[BUDGET ALERT TRIGGERED] Project "${projectName || projectId}" spent $${Number(todaySpend).toFixed(2)} today (Budget: $${dailyBudget})`);

    const resendApiKey = process.env.RESEND_API_KEY;
    const rawAlertEmail = process.env.ALERT_TO_EMAIL;
    const alertEmail = rawAlertEmail ? rawAlertEmail.replace(/[\[\]]/g, "").trim() : null;

    if (resendApiKey && alertEmail) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${resendApiKey}`
        },
        body: JSON.stringify({
          from: "LLM Tracker Alert <onboarding@resend.dev>",
          to: [alertEmail],
          subject: `⚠️ Budget Alert: Project "${projectName || projectId}" Exceeded Daily Limit`,
          html: `
            <h2>LLM Budget Exceeded</h2>
            <p>Your project <strong>${projectName || projectId}</strong> has crossed its daily budget limit.</p>
            <ul>
              <li><strong>Today's Spend:</strong> $${Number(todaySpend).toFixed(4)}</li>
              <li><strong>Daily Budget Limit:</strong> $${Number(dailyBudget).toFixed(2)}</li>
            </ul>
            <p>Check your dashboard to monitor usage or adjust your budget limits.</p>
          `
        })
      });
    }

    return NextResponse.json({ success: true, alerted: !!(resendApiKey && alertEmail) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
