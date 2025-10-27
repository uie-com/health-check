import { NextRequest, NextResponse } from 'next/server';

//
const sites = [
    {
        name: 'CC Home',
        url: 'https://centercentre.com',
        adminUrl: 'https://centercentre.com/wp-admin',
        dashboardUrl: 'https://panel.dreamhost.com/index.cgi?tree=domain.dashboard#/site/centercentre.com/dashboard'
    },
    {
        name: 'Articles',
        url: 'https://articles.centercentre.com',
        adminUrl: 'https://articles.centercentre.com/wp-admin',
        dashboardUrl: 'https://panel.dreamhost.com/index.cgi?tree=domain.dashboard#/site/articles.centercentre.com/dashboard'
    },
    {
        name: 'UIE Assets',
        url: 'https://asset.uie.com/',
        testUrl: 'https://asset.uie.com/pdf/2025-07-07-Why-Designing-for-GenAI-is-Different.pdf',
        adminUrl: 'https://www.notion.so/centercentre/PDF-Image-Hosting-201903316fdd8067ac01d1cd3b8dd980?source=copy_link',
        dashboardUrl: 'https://www.notion.so/centercentre/PDF-Image-Hosting-201903316fdd8067ac01d1cd3b8dd980?source=copy_link'
    },
    {
        name: 'Forms',
        url: 'https://form.centercentre.com/home',
        testUrl: 'https://form.centercentre.com/forms/contact',
        adminUrl: 'https://form.centercentre.com/home',
        dashboardUrl: 'https://cloud.digitalocean.com/droplets/505867845/graphs?i=176df9&period=hour'
    },
    {
        name: 'Visions',
        url: 'https://visions.centercentre.com',
        adminUrl: 'https://github.com/uie-admin/program-sites',
        dashboardUrl: 'https://app.netlify.com/projects/ux-vision/overview',
    },
    {
        name: 'Metrics',
        url: 'https://metrics.centercentre.com',
        adminUrl: 'https://github.com/uie-admin/program-sites',
        dashboardUrl: 'https://app.netlify.com/projects/ux-metrics-center-centre/overview',

    },
    {
        name: 'Research',
        url: 'https://research.centercentre.com',
        adminUrl: 'https://github.com/uie-admin/program-sites',
        dashboardUrl: 'https://app.netlify.com/projects/ux-research-center-centre/overview',

    },
    {
        name: 'Win Stakeholders',
        url: 'https://research.centercentre.com',
        adminUrl: 'https://github.com/uie-admin/program-sites',
        dashboardUrl: 'https://app.netlify.com/projects/winstakeholders/overview',
    },
    {
        name: 'GCal Service',
        url: 'https://gcal.centercentre.com',
        adminUrl: 'https://github.com/alextyang/gcal-sync',
        dashboardUrl: 'https://cloud.digitalocean.com/droplets/505867845/graphs?i=176df9&period=hour'
    },
    {
        name: 'Postmark Email Server',
        url: 'https://postmark.centercentre.com',
        adminUrl: 'https://github.com/alextyang/postmark-scheduler',
        dashboardUrl: 'https://cloud.digitalocean.com/droplets/505867845/graphs?i=176df9&period=hour'
    },
    {
        name: 'PDF Service',
        url: 'https://pdf.centercentre.com',
        testUrl: 'https://pdf.centercentre.com/create',
        adminUrl: 'https://github.com/alextyang/cc-pdf',
        dashboardUrl: 'https://app.netlify.com/projects/uie-pdf/overview'
    },
    {
        name: 'Airtable Middleman',
        url: 'https://airtable.centercentre.com',
        testUrl: 'https://airtable.centercentre.com/v0/appHcZTzlfXAJpL7I/tblm2TqCcDcx94nA2?filterByFormula=OR(FIND(%27Cohort%2010%27%2C%20ARRAYJOIN(%7BCohort%7D%2C%20%27%2C%27))%20%3E%200%2C%20%7BCohort%7D%20%3D%20%27Cohort%2010%27%2CFIND(%27Cohort%2011%27%2C%20ARRAYJOIN(%7BCohort%7D%2C%20%27%2C%27))%20%3E%200%2C%20%7BCohort%7D%20%3D%20%27Cohort%2011%27%2CFIND(%27Cohort%2012%27%2C%20ARRAYJOIN(%7BCohort%7D%2C%20%27%2C%27))%20%3E%200%2C%20%7BCohort%7D%20%3D%20%27Cohort%2012%27)',
        adminUrl: 'https://github.com/alextyang/airtable-cache',
        dashboardUrl: 'https://cloud.digitalocean.com/droplets/505867845/graphs?i=176df9&period=hour'
    },
];

const downWebhook = process.env.SLACK_DOWN_WEBHOOK ?? '';
const upWebhook = process.env.SLACK_UP_WEBHOOK ?? '';

export async function GET(request: NextRequest) {
    const urlParams = request.nextUrl.searchParams;
    const trySite = urlParams.get('site');
    const delay = urlParams.get('delay') ?? 0;

    if (delay && Number(delay) > 0) {
        console.log(`[HEALTH-CHECK] Delaying health check by ${delay} ms`);
        await new Promise(resolve => setTimeout(resolve, Number(delay)));
    }

    const results = await Promise.all(sites.map(async (site) => {
        try {
            const response = await fetch(site.testUrl || site.url, { method: 'HEAD' });
            console.log(`[HEALTH-CHECK] ${site.name} - ${response.status} ${response.statusText}`);
            return { status: response.ok ? 'up' : 'down', code: response.status, error: 'No response', ...site };
        } catch (error: any) {
            return { status: 'down', error: error.message, code: error.status, ...site };
        }
    }));

    const downSites = results.filter(result => result.status === 'down');
    for (const site of downSites) {
        const payload = {
            message: `${site.code || ''} ${site.error || 'No response'}  ${(!trySite && !delay) ? '(Retrying in 30s...)' : '(Retrying in 15m...)'}`,
            name: site.name,
            url: site.url,
            adminUrl: site.adminUrl,
            dashboardUrl: site.dashboardUrl,
            tryUrl: process.env.APP_URL + '/check?site=' + encodeURIComponent(site.name),
        };
        await fetch(downWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!trySite && !delay)
            fetch(process.env.APP_URL + '/check?site=' + encodeURIComponent(site.name) + '&delay=' + (1000 * 30), { method: 'GET', });

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (trySite) {
        const site = sites.find(s => s.name.toLowerCase() === trySite.toLowerCase());
        const downSite = downSites.find(s => s.name.toLowerCase() === trySite.toLowerCase());
        if (site && !downSite) {
            const payload = {
                name: site.name,
                url: site.url,
                adminUrl: site.adminUrl,
                dashboardUrl: site.dashboardUrl,
                tryUrl: process.env.APP_URL + '/?site=' + encodeURIComponent(site.name),
            };
            await fetch(upWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

        }
    }

    return NextResponse.json({ status: 'ok', message: 'Health check passed' });
}