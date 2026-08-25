/**
 * Filling in Spotify's create-app form on the person's behalf.
 *
 * Creating the app cannot be automated - Spotify has no API for it - so what
 * can be removed is the typing, and above all the redirect URI, which has to
 * match the server character for character and is the one thing people get
 * wrong. Everything here is data entry into a form the person is looking at and
 * can correct.
 *
 * Two things are deliberately left alone: the developer terms checkbox, which
 * is the person entering an agreement with Spotify, and the Create button. So
 * this leaves a filled-in form, never a created app.
 *
 * Uses Cordova's InAppBrowser rather than the Capacitor one the rest of the app
 * uses, because the Capacitor plugin's executeScript only ever runs on the
 * first page of the first webview - a second webview, or any navigation away
 * from the opening page, silently does nothing, which reproduces on
 * example.com with no redirects involved. Cordova's resolves the webview per
 * call, logs evaluation errors, and hands the script's return value straight
 * back to a callback, so nothing here depends on a message bridge.
 */

/** Fields to fill, matched by how the page describes them rather than by selector. */
export interface AppFormFill {
    filled: string[];
    missed: string[];
}

export interface AppFormOptions {
    /** The callback this deployment needs registered, from /spotify/byo/info. */
    redirectUri: string;
    appName?: string;
    appDescription?: string;
}

export interface AppFormResult {
    value?: AppFormFill;
    reason?: "unavailable" | "timeout" | "closed";
    diagnostics?: Record<string, unknown>;
}

const CREATE_URL = "https://developer.spotify.com/dashboard/create";

/** How long to keep trying before giving up on the form appearing. */
const DEADLINE_MS = 3 * 60 * 1000;

/** How often to look, since the page renders well after it loads. */
const POLL_MS = 1000;

/**
 * Returns a value rather than posting one: Cordova wraps this in an eval and
 * hands the result to our callback, so the answer comes back the same way it
 * would from any function call.
 */
function buildFillScript(options: AppFormOptions): string {
    const values = {
        name: options.appName ?? "Tempo",
        description: options.appDescription ?? "Tempo auth",
        redirectUri: options.redirectUri,
    };

    return `(function () {
        var V = ${JSON.stringify(values)};

        if (!/\\/dashboard\\/create/.test(location.href))
            return { status: "wrongPage", href: location.href };

        var text = function (el) { return ((el && el.textContent) || "").trim(); };

        // Everything the page calls a field, so one can be recognised however it
        // happens to be labelled. This form gives its inputs real name
        // attributes - name, description, newRedirectUri, apis-used-1,
        // termsAccepted - and the surrounding text is a fallback for when that
        // stops being true.
        var describe = function (el) {
            var parts = [el.getAttribute("name"), el.getAttribute("id"), el.getAttribute("placeholder"), el.getAttribute("aria-label")];

            try {
                if (el.id) {
                    var explicit = document.querySelector('label[for="' + el.id + '"]');

                    if (explicit)
                        parts.push(text(explicit));
                }

                var node = el.parentElement;

                for (var i = 0; i < 4 && node; i++) {
                    var surrounding = text(node);

                    if (surrounding && surrounding.length < 120) {
                        parts.push(surrounding);

                        break;
                    }

                    node = node.parentElement;
                }
            } catch (e) { }

            return parts.filter(Boolean).join(" ").toLowerCase();
        };

        var fields = [].slice.call(document.querySelectorAll("input, textarea"))
            .filter(function (el) { return el.type !== "hidden" && !el.disabled; });

        // The terms checkbox is the person's to accept and must never match
        var isTerms = function (d) { return /terms|conditions|agree|design guidelines|policy/.test(d); };

        var find = function (test) {
            return fields.filter(function (el) {
                var d = describe(el);

                return !isTerms(d) && test(d, el);
            })[0];
        };

        var nameField = find(function (d, el) { return el.type !== "checkbox" && /app name|^name/.test(d); });

        // Rendered client-side, so an early look finds an empty document
        if (!nameField)
            return { status: "notReady", href: location.href, fields: fields.length };

        /*
         * React keeps an input's value on the node and ignores assignments it
         * did not make, so setting .value directly leaves the state it submits
         * from untouched - the field looks filled and submits empty. Going
         * through the prototype setter and announcing it is what React listens
         * for.
         */
        var setValue = function (el, value) {
            var proto = (el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement : window.HTMLInputElement).prototype;

            Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);

            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
        };

        var filled = [];
        var missed = [];

        // Idempotent: this runs once a second until the URI is added, and
        // rewriting a field the person may have corrected would fight them
        var setIfNeeded = function (el, value) {
            if (el.value !== value)
                setValue(el, value);
        };

        var fill = function (label, test, value) {
            var el = find(test);

            if (!el) {
                missed.push(label);

                return undefined;
            }

            setIfNeeded(el, value);
            filled.push(label);

            return el;
        };

        setIfNeeded(nameField, V.name);
        filled.push("name");

        fill("description", function (d, el) { return el.type !== "checkbox" && /description/.test(d); }, V.description);

        /*
         * What is already in the redirect list, found by the Remove button
         * beside each entry.
         *
         * This is the only reliable way to tell whether the URI is saved, and
         * getting it wrong is expensive: pressing Add clears the box, so a pass
         * that judged by the box alone refilled it, pressed Add again, and left
         * the same URI listed four times over.
         */
        var listedFor = function (uri) {
            return [].slice.call(document.querySelectorAll("button"))
                .filter(function (b) { return /^remove$/i.test(text(b)); })
                .map(function (b) {
                    var row = b.parentElement;

                    for (var i = 0; i < 4 && row; i++) {
                        if ((row.textContent || "").indexOf(uri) !== -1)
                            return b;

                        row = row.parentElement;
                    }

                    return null;
                })
                .filter(Boolean);
        };

        var listed = listedFor(V.redirectUri);

        // Duplicates from an earlier pass of this script. Removing them is
        // tidying up after ourselves on a control that is reversible, and the
        // app should carry this URI exactly once.
        if (listed.length > 1) {
            for (var extra = 1; extra < listed.length; extra++)
                listed[extra].click();

            return { status: "filled", filled: filled, missed: missed, removedDuplicates: listed.length - 1 };
        }


        // Which API the app uses: a required choice, and configuration rather
        // than an agreement, so it is ticked here
        var webApi = fields.filter(function (el) { return el.type === "checkbox" && /web api/.test(describe(el)) && !isTerms(describe(el)); })[0];

        if (webApi) {
            if (!webApi.checked)
                webApi.click();

            filled.push("webApi");
        } else {
            missed.push("webApi");
        }

        /*
         * Spotify keeps redirect URIs as a list, and a typed value only joins
         * it when Add is pressed - left in the box it is not saved with the
         * app, which is the failure this whole flow exists to prevent.
         *
         * Deliberately not done in the same pass as the fill: Add is disabled
         * until React has re-rendered with the new value, so a click straight
         * after setting it finds a disabled button and does nothing. The caller
         * polls, so the next pass a second later finds it enabled.
         */
        // Saved. Nothing more to type, and nothing more to press.
        if (listed.length === 1) {
            filled.push("redirectUri");

            return { status: "added", filled: filled, missed: missed };
        }

        // Not listed yet, so the box needs the value before Add can take it
        var redirect = find(function (d, el) { return el.type !== "checkbox" && /redirect/.test(d); });

        if (!redirect) {
            missed.push("redirectUri");

            return { status: "filled", filled: filled, missed: missed, addPending: true };
        }

        setIfNeeded(redirect, V.redirectUri);

        var addButton;
        var node = redirect;

        for (var lvl = 0; lvl < 5 && node && !addButton; lvl++) {
            node = node.parentElement;

            if (!node)
                break;

            addButton = [].slice.call(node.querySelectorAll("button")).filter(function (b) {
                return /^add$/i.test(text(b));
            })[0];
        }

        if (!addButton)
            return { status: "filled", filled: filled, missed: missed, addPending: true, addFound: false };

        if (addButton.disabled)
            return { status: "filled", filled: filled, missed: missed, addPending: true, addDisabled: true };

        addButton.click();

        // Confirmed on the next pass rather than assumed here, for the same
        // reason Add could not be pressed on the last one
        return { status: "filled", filled: filled, missed: missed, addClicked: true };
    })()`;
}

/**
 * Ticks Spotify's terms box and submits the form.
 *
 * Run only after the person has agreed in Tempo's own UI, to the same wording,
 * with the same links to Spotify's documents. That consent is theirs to give -
 * this relays it, and must never run without it.
 */
function buildCreateScript(): string {
    return `(function () {
        var text = function (el) { return ((el && el.textContent) || "").trim(); };

        var describe = function (el) {
            var parts = [el.getAttribute("name"), el.getAttribute("id"), el.getAttribute("aria-label")];

            try {
                if (el.id) {
                    var explicit = document.querySelector('label[for="' + el.id + '"]');

                    if (explicit)
                        parts.push(text(explicit));
                }

                var node = el.parentElement;

                for (var i = 0; i < 4 && node; i++) {
                    var surrounding = text(node);

                    if (surrounding && surrounding.length < 300) {
                        parts.push(surrounding);

                        break;
                    }

                    node = node.parentElement;
                }
            } catch (e) { }

            return parts.filter(Boolean).join(" ").toLowerCase();
        };

        var terms = [].slice.call(document.querySelectorAll('input[type="checkbox"]')).filter(function (el) {
            return /terms|conditions|agree|design guidelines/.test(describe(el));
        })[0];

        if (!terms)
            return { status: "noTerms" };

        if (!terms.checked)
            terms.click();

        var submit = [].slice.call(document.querySelectorAll("button")).filter(function (b) {
            return /^(save|create)$/i.test(text(b));
        })[0];

        if (!submit)
            return { status: "noSubmit", termsChecked: terms.checked };

        // Disabled until the page has taken the tick above; the caller tries
        // again rather than pressing something that will not respond
        if (submit.disabled)
            return { status: "submitDisabled", termsChecked: terms.checked };

        submit.click();

        return { status: "submitted", termsChecked: terms.checked };
    })()`;
}

interface CordovaBrowserRef {
    addEventListener: (name: string, cb: (event?: unknown) => void) => void;
    removeEventListener: (name: string, cb: (event?: unknown) => void) => void;
    executeScript: (details: { code: string }, cb?: (results: unknown[]) => void) => void;
    show: () => void;
    close: () => void;
}

export interface AppFormSession {
    /** Resolves once the form is filled and the redirect URI is saved. */
    ready: Promise<AppFormResult>;
    /**
     * Agrees to Spotify's terms and submits, then shows the webview.
     *
     * Call only when the person has ticked the same agreement in Tempo, which
     * carries Spotify's wording and links to its documents. Retries briefly,
     * because the submit button stays disabled until the page has taken the
     * tick.
     */
    create: () => Promise<{ ok: boolean; status?: string }>;
    /** Brings the webview on screen. */
    reveal: () => void;
    close: () => void;
}

/**
 * Prepares the create-app form, by default out of sight.
 *
 * Filling happens while the person reads and agrees in Tempo's own UI, so by
 * the time they press Continue there is nothing left to wait for. The webview
 * only ever comes forward when it needs them: to log in to Spotify, or once the
 * app has been submitted.
 */
export function startSpotifyAppForm(options: AppFormOptions & { hidden?: boolean }): AppFormSession {
    const iab = (window as unknown as {
        cordova?: { InAppBrowser?: { open: (url: string, target: string, opts?: string) => CordovaBrowserRef } };
    }).cordova?.InAppBrowser;

    let ref: CordovaBrowserRef | undefined;
    let settled = false;
    let shown = !options.hidden;
    let last: Record<string, unknown> | undefined;
    let resolveReady: (result: AppFormResult) => void = () => { };

    const ready = new Promise<AppFormResult>((resolve) => { resolveReady = resolve; });

    const finish = (result: AppFormResult) => {
        if (settled)
            return;

        settled = true;

        clearInterval(poll);
        clearTimeout(deadline);

        resolveReady({ ...result, diagnostics: result.diagnostics ?? last });
    };

    const reveal = () => {
        if (shown || !ref)
            return;

        shown = true;

        try { ref.show(); } catch { }
    };

    if (!iab) {
        resolveReady({ reason: "unavailable" });

        return { ready, create: async () => ({ ok: false, status: "unavailable" }), reveal: () => { }, close: () => { } };
    }

    const code = buildFillScript(options);

    try {
        ref = iab.open(CREATE_URL, "_blank", `location=yes,hidden=${options.hidden ? "yes" : "no"}`);
    } catch (ex) {
        resolveReady({ reason: "unavailable", diagnostics: { error: String(ex) } });

        return { ready, create: async () => ({ ok: false, status: "unavailable" }), reveal: () => { }, close: () => { } };
    }

    let offPage = 0;

    const attempt = () => {
        if (settled || !ref)
            return;

        try {
            ref.executeScript({ code }, (results) => {
                const value = (Array.isArray(results) ? results[0] : undefined) as Record<string, unknown> | undefined;

                if (!value)
                    return;

                last = value;

                /*
                 * Somewhere other than the form, which on this dashboard means
                 * a login. Nothing can be filled until they are through it, and
                 * they cannot get through a webview they cannot see - so after
                 * a few seconds of being elsewhere, bring it forward.
                 */
                if (value.status === "wrongPage") {
                    offPage++;

                    if (offPage > 4)
                        reveal();

                    return;
                }

                offPage = 0;

                if (value.status === "added")
                    finish({ value: { filled: (value.filled as string[]) ?? [], missed: (value.missed as string[]) ?? [] } });
            });
        } catch { }
    };

    ref.addEventListener("loadstop", attempt);
    ref.addEventListener("exit", () => finish({ reason: "closed" }));

    const poll = setInterval(attempt, POLL_MS);
    const deadline = setTimeout(() => finish({ reason: "timeout" }), DEADLINE_MS);

    const create = () => new Promise<{ ok: boolean; status?: string }>((resolve) => {
        if (!ref) {
            resolve({ ok: false, status: "unavailable" });

            return;
        }

        // Shown before submitting: from here the person is looking at their own
        // app being made, and whatever Spotify says next is for them to see
        reveal();

        const createCode = buildCreateScript();

        let tries = 0;

        const tick = () => {
            tries++;

            ref!.executeScript({ code: createCode }, (results) => {
                const value = (Array.isArray(results) ? results[0] : undefined) as { status?: string } | undefined;

                if (!value)
                    return;

                if (value.status === "submitted") {
                    clearInterval(timer);
                    resolve({ ok: true, status: value.status });

                    return;
                }

                // Only the disabled case is worth waiting on; the rest will not
                // improve by asking again
                if (value.status !== "submitDisabled" || tries > 8) {
                    clearInterval(timer);
                    resolve({ ok: false, status: value.status });
                }
            });
        };

        const timer = setInterval(tick, 700);

        tick();
    });

    return {
        ready,
        create,
        reveal,
        close: () => { try { ref?.close(); } catch { } },
    };
}
