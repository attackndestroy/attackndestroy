(function () {
    "use strict";

    const CONFIG = {
        endpoint: "https://fra.cloud.appwrite.io/v1",
        projectId: "6a864872000d5c2e73fa",
        databaseId: "6a864b5700077be988ef",
        eventsTable: "events",
        sessionsTable: "sessions",
        rootDomain: "attdes.online",
        sdk: "https://cdn.jsdelivr.net/npm/appwrite@23.0.0",
        sessionTimeout: 30 * 60 * 1000,
        flushInterval: 5000,
        pingInterval: 30000,
        batchSize: 10,
        maxQueue: 100,
        retryDelay: 5000
    };

    const PREFIX = "attdes_analytics_";
    const VISITOR_KEY = PREFIX + "visitor_id";
    const SESSION_KEY = PREFIX + "session_id";
    const SESSION_START_KEY = PREFIX + "session_start";
    const SESSION_CREATED_KEY = PREFIX + "session_created";
    const QUEUE_KEY = PREFIX + "queue";

    let db = null;
    let ID = null;
    let started = false;
    let flushing = false;
    let queue = [];
    let visitorId = null;
    let sessionId = null;
    let sessionStart = 0;
    let isNewVisitor = false;
    let flushTimer = null;
    let pingTimer = null;

    function storageGet(storage, key) {
        try {
            return storage.getItem(key);
        } catch {
            return null;
        }
    }

    function storageSet(storage, key, value) {
        try {
            storage.setItem(key, value);
        } catch {}
    }

    function storageRemove(storage, key) {
        try {
            storage.removeItem(key);
        } catch {}
    }

    function randomId(prefix) {
        if (
            window.crypto &&
            typeof window.crypto.randomUUID === "function"
        ) {
            return prefix + "_" + window.crypto.randomUUID();
        }

        if (
            window.crypto &&
            typeof window.crypto.getRandomValues === "function"
        ) {
            const bytes = new Uint8Array(16);
            window.crypto.getRandomValues(bytes);

            let value = "";

            for (let i = 0; i < bytes.length; i++) {
                value += bytes[i].toString(16).padStart(2, "0");
            }

            return prefix + "_" + value;
        }

        return (
            prefix +
            "_" +
            Date.now().toString(36) +
            "_" +
            Math.random().toString(36).slice(2)
        );
    }

    function clean(value, max) {
        if (
            value === null ||
            value === undefined
        ) {
            return null;
        }

        const result = String(value).trim();

        if (!result) {
            return null;
        }

        return result.slice(0, max);
    }

    function validHost() {
        const host = location.hostname
            .toLowerCase()
            .replace(/\.$/, "");

        return (
            host === CONFIG.rootDomain ||
            host.endsWith("." + CONFIG.rootDomain)
        );
    }

    function currentSite() {
        return location.hostname
            .toLowerCase()
            .replace(/\.$/, "");
    }

    function query(name, max) {
        try {
            return clean(
                new URLSearchParams(location.search).get(name),
                max
            );
        } catch {
            return null;
        }
    }

    function getVisitor() {
        let value = storageGet(
            localStorage,
            VISITOR_KEY
        );

        if (value) {
            isNewVisitor = false;
            return value;
        }

        value = randomId("visitor");

        storageSet(
            localStorage,
            VISITOR_KEY,
            value
        );

        isNewVisitor = true;

        return value;
    }

    function getSession() {
        let id = storageGet(
            sessionStorage,
            SESSION_KEY
        );

        let start = Number(
            storageGet(
                sessionStorage,
                SESSION_START_KEY
            )
        );

        const now = Date.now();

        if (
            !id ||
            !start ||
            now - start > CONFIG.sessionTimeout
        ) {
            id = randomId("session");
            start = now;

            storageSet(
                sessionStorage,
                SESSION_KEY,
                id
            );

            storageSet(
                sessionStorage,
                SESSION_START_KEY,
                String(start)
            );

            storageRemove(
                sessionStorage,
                SESSION_CREATED_KEY
            );
        }

        return {
            id: id,
            start: start
        };
    }

    function getDevice() {
        const ua = navigator.userAgent || "";
        const width = Math.max(
            document.documentElement.clientWidth || 0,
            window.innerWidth || 0
        );

        if (
            /ipad|tablet/i.test(ua) ||
            (width >= 600 && width <= 1200)
        ) {
            return "tablet";
        }

        if (
            /mobile|android|iphone|ipod|windows phone/i.test(ua)
        ) {
            return "mobile";
        }

        return "desktop";
    }

    function getOS() {
        const ua = navigator.userAgent || "";

        if (/Windows NT/i.test(ua)) return "Windows";
        if (/Android/i.test(ua)) return "Android";
        if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
        if (/Mac OS X/i.test(ua)) return "macOS";
        if (/CrOS/i.test(ua)) return "ChromeOS";
        if (/Linux/i.test(ua)) return "Linux";

        return "Unknown";
    }

    function getBrowser() {
        const ua = navigator.userAgent || "";

        if (/Edg\//i.test(ua)) return "Edge";
        if (/OPR\//i.test(ua)) return "Opera";
        if (/Firefox\//i.test(ua)) return "Firefox";
        if (/Chrome\//i.test(ua)) return "Chrome";
        if (/Safari\//i.test(ua)) return "Safari";

        return "Unknown";
    }

    function getMarketing() {
        return {
            referrer: clean(
                document.referrer,
                512
            ),

            utm_source: query(
                "utm_source",
                128
            ),

            utm_medium: query(
                "utm_medium",
                128
            ),

            utm_campaign: query(
                "utm_campaign",
                128
            )
        };
    }

    function saveQueue() {
        try {
            storageSet(
                localStorage,
                QUEUE_KEY,
                JSON.stringify(
                    queue.slice(-CONFIG.maxQueue)
                )
            );
        } catch {}
    }

    function loadQueue() {
        try {
            const saved = storageGet(
                localStorage,
                QUEUE_KEY
            );

            if (!saved) {
                queue = [];
                return;
            }

            const parsed = JSON.parse(saved);

            queue =
                Array.isArray(parsed)
                    ? parsed.slice(-CONFIG.maxQueue)
                    : [];
        } catch {
            queue = [];
        }
    }

    function loadSDK() {
        if (window.Appwrite) {
            return Promise.resolve(
                window.Appwrite
            );
        }

        return new Promise(function (resolve, reject) {
            const existing =
                document.querySelector(
                    "script[data-attdes-appwrite]"
                );

            if (existing) {
                existing.addEventListener(
                    "load",
                    function () {
                        if (window.Appwrite) {
                            resolve(window.Appwrite);
                        } else {
                            reject(
                                new Error(
                                    "Appwrite SDK unavailable"
                                )
                            );
                        }
                    },
                    { once: true }
                );

                existing.addEventListener(
                    "error",
                    function () {
                        reject(
                            new Error(
                                "Appwrite SDK failed"
                            )
                        );
                    },
                    { once: true }
                );

                return;
            }

            const script =
                document.createElement("script");

            script.src = CONFIG.sdk;
            script.async = true;
            script.dataset.attdesAppwrite = "true";

            script.onload = function () {
                if (window.Appwrite) {
                    resolve(
                        window.Appwrite
                    );
                } else {
                    reject(
                        new Error(
                            "Appwrite SDK unavailable"
                        )
                    );
                }
            };

            script.onerror = function () {
                reject(
                    new Error(
                        "Appwrite SDK failed"
                    )
                );
            };

            document.head.appendChild(script);
        });
    }

    async function initialize() {
        const Appwrite =
            await loadSDK();

        const client =
            new Appwrite.Client();

        client
            .setEndpoint(CONFIG.endpoint)
            .setProject(CONFIG.projectId);

        db =
            new Appwrite.TablesDB(
                client
            );

        ID =
            Appwrite.ID;
    }

    function addEvent(
        type,
        label
    ) {
        if (!started) {
            return;
        }

        queue.push({
            databaseId: CONFIG.databaseId,
            tableId: CONFIG.eventsTable,
            rowId: ID.unique(),
            data: {
                session_id: sessionId,
                site_id: currentSite(),
                event_type: clean(type, 32),
                page_url: clean(
                    location.href,
                    2048
                ),
                page_title: clean(
                    document.title,
                    255
                ),
                target_label: clean(
                    label,
                    255
                )
            }
        });

        if (queue.length >= CONFIG.batchSize) {
            flush();
        } else {
            saveQueue();
        }
    }

    async function createSession() {
        const alreadyCreated =
            storageGet(
                sessionStorage,
                SESSION_CREATED_KEY
            );

        if (alreadyCreated) {
            return;
        }

        const marketing =
            getMarketing();

        try {
            await db.createRow({
                databaseId:
                    CONFIG.databaseId,

                tableId:
                    CONFIG.sessionsTable,

                rowId:
                    ID.unique(),

                data: {
                    session_id: sessionId,
                    site_id: currentSite(),
                    visitor_id: visitorId,
                    is_new: isNewVisitor,
                    device: getDevice(),
                    os: getOS(),
                    browser: getBrowser(),
                    language: clean(
                        navigator.language ||
                        "unknown",
                        10
                    ),
                    country: null,
                    referrer:
                        marketing.referrer,
                    utm_source:
                        marketing.utm_source,
                    utm_medium:
                        marketing.utm_medium,
                    utm_campaign:
                        marketing.utm_campaign,
                    last_ping:
                        new Date().toISOString(),
                    duration: 0
                }
            });

            storageSet(
                sessionStorage,
                SESSION_CREATED_KEY,
                "1"
            );
        } catch {
            return;
        }
    }

    async function sendOne(item) {
        await db.createRow(item);
    }

    async function flush() {
        if (
            flushing ||
            !db ||
            !queue.length
        ) {
            return;
        }

        flushing = true;

        const batch =
            queue.splice(
                0,
                CONFIG.batchSize
            );

        saveQueue();

        const failed = [];

        for (const item of batch) {
            try {
                await sendOne(item);
            } catch {
                failed.push(item);
            }
        }

        if (failed.length) {
            queue =
                failed
                    .concat(queue)
                    .slice(-CONFIG.maxQueue);

            saveQueue();

            setTimeout(
                flush,
                CONFIG.retryDelay
            );
        }

        flushing = false;
    }

    function getLabel(element) {
        return clean(
            element.getAttribute(
                "data-analytics-label"
            ) ||
            element.getAttribute(
                "aria-label"
            ) ||
            element.getAttribute(
                "download"
            ) ||
            element.innerText ||
            element.textContent ||
            "",
            255
        );
    }

    function isDownload(element) {
        if (
            element.hasAttribute(
                "download"
            )
        ) {
            return true;
        }

        const href =
            element.getAttribute(
                "href"
            );

        if (!href) {
            return false;
        }

        return /\.(zip|rar|7z|apk|mcpack|mcaddon|mcworld|mctemplate|pdf|exe|msi)(?:[?#].*)?$/i.test(
            href
        );
    }

    function clickHandler(event) {
        let element =
            event.target;

        while (
            element &&
            element !== document &&
            element.tagName !== "A" &&
            element.tagName !== "BUTTON"
        ) {
            element =
                element.parentElement;
        }

        if (!element) {
            return;
        }

        addEvent(
            isDownload(element)
                ? "download"
                : "click",
            getLabel(element)
        );
    }

    function ping() {
        addEvent(
            "session_ping",
            null
        );

        flush();
    }

    function visibilityHandler() {
        if (
            document.visibilityState ===
            "visible"
        ) {
            ping();
        }

        if (
            document.visibilityState ===
            "hidden"
        ) {
            flush();
        }
    }

    function pageView() {
        addEvent(
            "pageview",
            null
        );
    }

    function beforeUnload() {
        saveQueue();
    }

    async function start() {
        if (
            started ||
            !validHost()
        ) {
            return;
        }

        loadQueue();

        try {
            await initialize();

            visitorId =
                getVisitor();

            const session =
                getSession();

            sessionId =
                session.id;

            sessionStart =
                session.start;

            started = true;

            await createSession();

            pageView();

            document.addEventListener(
                "click",
                clickHandler,
                true
            );

            document.addEventListener(
                "visibilitychange",
                visibilityHandler
            );

            window.addEventListener(
                "beforeunload",
                beforeUnload
            );

            flushTimer =
                setInterval(
                    flush,
                    CONFIG.flushInterval
                );

            pingTimer =
                setInterval(
                    ping,
                    CONFIG.pingInterval
                );

            flush();

        } catch {
            started = false;
        }
    }

    window.ATTDESTracker = {
        track: function (
            type,
            label
        ) {
            addEvent(
                type,
                label
            );
        },

        pageview: function () {
            pageView();
        },

        click: function (
            label
        ) {
            addEvent(
                "click",
                label
            );
        },

        download: function (
            label
        ) {
            addEvent(
                "download",
                label
            );
        },

        flush: function () {
            return flush();
        }
    };

    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            start,
            { once: true }
        );
    } else {
        start();
    }
})();