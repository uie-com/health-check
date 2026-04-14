import { getStore } from '@netlify/blobs';
import { NextRequest, NextResponse } from 'next/server';

interface SiteCheck {
    name: string;
    url: string;
    testUrl?: string;
    adminUrl?: string;
    dashboardUrl?: string;
}

interface SiteCheckResult extends SiteCheck {
    status: 'up' | 'down';
    code?: number;
    error?: string;
}

interface DownAlertState {
    downSince: number;
    lastDownAlertedAt: number;
    lastCheckedAt: number;
}

const ALERT_STATE_STORE_NAME = 'health-check-alert-state';
const DEFAULT_DOWN_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

//
const sites: SiteCheck[] = [
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
        testUrl: 'https://airtable.centercentre.com/v0/appHcZTzlfXAJpL7I/tblm2TqCcDcx94nA2?filterByFormula=OR(FIND(%27Cohort%2010%27%2C%20ARRAYJOIN(%7BCohort%7D%2C%20%27%2C%27))%20%3E%200%2C%20%7BCohort%7D%20%3D%20%27Cohort%2010%27%2CFIND(%27Cohort%2011%27%2C%20ARRAYJOIN(%7BCohort%7D%2C%20%27%2C%27))%20%3E%200%2C%20%7BCohort%7D%20%3D%20%27Cohort%2011%27%2CFIND(%27Cohort%2012%27%2C%20ARRAYJOIN(%7BCohort%7D%2C%20%27%2C%27))%20%3E%200%2C%20%7BCohort%7D%20%3D%20%27Cohort%2012%27)&ref=health-check',
        adminUrl: 'https://github.com/alextyang/airtable-cache',
        dashboardUrl: 'https://cloud.digitalocean.com/droplets/505867845/graphs?i=176df9&period=hour'
    },
];

const downWebhook = process.env.SLACK_DOWN_WEBHOOK ?? '';
const upWebhook = process.env.SLACK_UP_WEBHOOK ?? '';
const downAlertCooldownMs = readCooldownMs();

let hasLoggedBlobAccessError = false;

export async function GET(request: NextRequest) {
    const urlParams = request.nextUrl.searchParams;
    const trySite = urlParams.get('site');
    const normalizedTrySite = trySite?.toLowerCase();
    const sitesToCheck = normalizedTrySite
        ? sites.filter((site) => site.name.toLowerCase() === normalizedTrySite)
        : sites;

    const results = await Promise.all(sitesToCheck.map(async (site): Promise<SiteCheckResult> => {
        try {
            const response = await fetch(site.testUrl || site.url, { method: 'HEAD' });
            console.log(`[HEALTH-CHECK] ${site.name} - ${response.status} ${response.statusText}`);
            return { status: response.ok ? 'up' : 'down', code: response.status, error: 'No response', ...site };
        } catch (error: any) {
            return { status: 'down', error: error.message, code: error.status, ...site };
        }
    }));

    if (trySite) {
        console.log(`[HEALTH-CHECK] Retry check for site: ${trySite}`);
        const site = sitesToCheck[0];
        const retryResult = results[0];
        const existingDownState = site ? await readDownAlertState(site.name) : null;

        if (site && retryResult?.status === 'up') {
            const outageDurationMs = existingDownState
                ? Math.max(0, Date.now() - existingDownState.downSince)
                : 0;
            const payload = {
                name: site.name,
                url: site.url,
                adminUrl: site.adminUrl,
                dashboardUrl: site.dashboardUrl,
                tryUrl: process.env.APP_URL + '/check?site=' + encodeURIComponent(site.name),
                outageLength: formatDuration(outageDurationMs),
                outageDurationMs,
            };

            if (existingDownState) {
                await postWebhook(upWebhook, payload);
            }

            await clearDownAlertState(site.name);
        } else if (site && existingDownState) {
            await writeDownAlertState(site.name, {
                ...existingDownState,
                lastCheckedAt: Date.now(),
            });

        }
    } else {
        for (const result of results) {
            const existingDownState = await readDownAlertState(result.name);

            if (result.status === 'up') {
                if (existingDownState) {
                    await clearDownAlertState(result.name);
                }
                continue;
            }

            const checkedAt = Date.now();
            const shouldSendDownAlert =
                !existingDownState ||
                checkedAt - existingDownState.lastDownAlertedAt >= downAlertCooldownMs;

            await writeDownAlertState(result.name, {
                downSince: existingDownState?.downSince ?? checkedAt,
                lastDownAlertedAt: shouldSendDownAlert
                    ? checkedAt
                    : existingDownState.lastDownAlertedAt,
                lastCheckedAt: checkedAt,
            });

            if (!shouldSendDownAlert) {
                continue;
            }

            const payload = {
                message: buildDownAlertMessage(result, checkedAt, existingDownState?.downSince ?? checkedAt),
                name: result.name,
                url: result.url,
                adminUrl: result.adminUrl,
                dashboardUrl: result.dashboardUrl,
                tryUrl: process.env.APP_URL + '/check?site=' + encodeURIComponent(result.name),
                downSince: new Date(existingDownState?.downSince ?? checkedAt).toISOString(),
                outageLength: formatDuration(checkedAt - (existingDownState?.downSince ?? checkedAt)),
                outageDurationMs: checkedAt - (existingDownState?.downSince ?? checkedAt),
            };
            await postWebhook(downWebhook, payload);

            fetch(`${process.env.URL}/.netlify/functions/retry-background`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ siteName: result.name, retryInMs: 60000 }),
            }).catch(() => { });

            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return NextResponse.json({ status: 'ok', message: 'Health check passed' });
}

function readCooldownMs(): number {
    const rawValue = process.env.DOWN_ALERT_COOLDOWN_MS;
    if (!rawValue) {
        return DEFAULT_DOWN_ALERT_COOLDOWN_MS;
    }

    const parsedValue = Number(rawValue);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        return DEFAULT_DOWN_ALERT_COOLDOWN_MS;
    }

    return parsedValue;
}

function buildDownAlertMessage(
    result: SiteCheckResult,
    checkedAt: number,
    downSince: number,
): string {
    const outageDurationMs = Math.max(0, checkedAt - downSince);
    const outagePrefix =
        outageDurationMs < 60_000
            ? 'New outage'
            : `Still down after ${formatDuration(outageDurationMs)}`;

    return `${outagePrefix}: ${result.code || ''} ${result.error || 'No response'} (Retrying in 60s...)`;
}

function formatDuration(durationMs: number): string {
    const totalMinutes = Math.max(0, Math.floor(durationMs / 60_000));
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;

    const parts: string[] = [];
    if (days > 0) {
        parts.push(`${days} day${days === 1 ? '' : 's'}`);
    }
    if (hours > 0) {
        parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
    }
    if (minutes > 0 && days === 0) {
        parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
    }

    return parts.length > 0 ? parts.join(', ') : 'less than a minute';
}

function getDownAlertStateKey(siteName: string): string {
    return `sites/${encodeURIComponent(siteName.toLowerCase())}`;
}

function getDownAlertStateStore() {
    return getStore({ name: ALERT_STATE_STORE_NAME, consistency: 'strong' });
}

function isDownAlertState(value: unknown): value is DownAlertState {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as DownAlertState).downSince === 'number' &&
        typeof (value as DownAlertState).lastDownAlertedAt === 'number' &&
        typeof (value as DownAlertState).lastCheckedAt === 'number'
    );
}

function logBlobAccessError(action: string, error: unknown) {
    if (hasLoggedBlobAccessError) {
        return;
    }

    hasLoggedBlobAccessError = true;
    console.warn(`[HEALTH-CHECK] Netlify Blobs ${action} failed; falling back to stateless alerting.`, error);
}

async function readDownAlertState(siteName: string): Promise<DownAlertState | null> {
    try {
        const state = await getDownAlertStateStore().get(getDownAlertStateKey(siteName), {
            type: 'json',
        });

        return isDownAlertState(state) ? state : null;
    } catch (error) {
        logBlobAccessError('read', error);
        return null;
    }
}

async function writeDownAlertState(siteName: string, state: DownAlertState): Promise<void> {
    try {
        await getDownAlertStateStore().setJSON(getDownAlertStateKey(siteName), state);
    } catch (error) {
        logBlobAccessError('write', error);
    }
}

async function clearDownAlertState(siteName: string): Promise<void> {
    try {
        await getDownAlertStateStore().delete(getDownAlertStateKey(siteName));
    } catch (error) {
        logBlobAccessError('delete', error);
    }
}

async function postWebhook(webhookUrl: string, payload: object): Promise<void> {
    if (!webhookUrl) {
        return;
    }

    await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}
