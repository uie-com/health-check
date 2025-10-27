export default async (request: Request) => {
    const { siteName, retryInMs = 30_000 } = await request.json();

    // wait until it's time to retry
    await new Promise((r) => setTimeout(r, retryInMs));

    // call your Next.js route (use a full absolute URL)
    await fetch(`${process.env.URL}/check?site=${encodeURIComponent(siteName)}`, { method: 'GET', });

    console.log(`[RETRY-BACKGROUND] Retried site: ${siteName} after ${retryInMs}ms with url ${process.env.URL}/check?site=${encodeURIComponent(siteName)}`);

    // Background functions return 202 immediately; no explicit response body needed
};