(function () {
    "use strict";

    /*
     * ATT/DES Analytics
     * Browser Analytics Tracker
     */

    const CONFIG = {
        endpoint: "https://fra.cloud.appwrite.io/v1",

        projectId: "6a864872000d5c2e73fa",

        databaseId: "6a864b5700077be988ef",

        eventsTable: "events",

        sessionsTable: "sessions",

        rootDomain: "attdes.online",

        sessionTimeout: 30 * 60 * 1000,

        flushInterval: 3000,

        pingInterval: 30000,

        batchSize: 10,

        maxQueue: 100,

        retryDelay: 5000,

        debug: true
    };


    const PREFIX = "attdes_analytics_";

    const VISITOR_KEY =
        PREFIX + "visitor_id";

    const SESSION_KEY =
        PREFIX + "session_id";

    const SESSION_START_KEY =
        PREFIX + "session_start";

    const SESSION_CREATED_KEY =
        PREFIX + "session_created";

    const QUEUE_KEY =
        PREFIX + "queue";


    let started = false;

    let flushing = false;

    let queue = [];

    let visitorId = null;

    let sessionId = null;

    let sessionStart = 0;

    let isNewVisitor = false;

    let flushTimer = null;

    let pingTimer = null;


    /*
     * --------------------------------------------------
     * DEBUG
     * --------------------------------------------------
     */

    function log() {
        if (!CONFIG.debug) {
            return;
        }

        try {
            console.log(
                "[ATT/DES Analytics]",
                ...arguments
            );
        } catch {}
    }


    function warn() {
        if (!CONFIG.debug) {
            return;
        }

        try {
            console.warn(
                "[ATT/DES Analytics]",
                ...arguments
            );
        } catch {}
    }


    function errorLog() {
        try {
            console.error(
                "[ATT/DES Analytics]",
                ...arguments
            );
        } catch {}
    }


    /*
     * --------------------------------------------------
     * STORAGE
     * --------------------------------------------------
     */

    function storageGet(storage, key) {
        try {
            return storage.getItem(key);
        } catch (error) {
            warn(
                "Storage read failed:",
                error
            );

            return null;
        }
    }


    function storageSet(storage, key, value) {
        try {
            storage.setItem(
                key,
                value
            );

            return true;

        } catch (error) {

            warn(
                "Storage write failed:",
                error
            );

            return false;
        }
    }


    function storageRemove(storage, key) {
        try {
            storage.removeItem(key);
        } catch {}
    }


    /*
     * --------------------------------------------------
     * RANDOM IDS
     * --------------------------------------------------
     */

    function randomId(prefix) {

        if (
            window.crypto &&
            typeof window.crypto.randomUUID ===
                "function"
        ) {
            return (
                prefix +
                "_" +
                window.crypto.randomUUID()
            );
        }


        if (
            window.crypto &&
            typeof window.crypto.getRandomValues ===
                "function"
        ) {

            const bytes =
                new Uint8Array(16);

            window.crypto.getRandomValues(
                bytes
            );

            let value = "";

            for (
                let i = 0;
                i < bytes.length;
                i++
            ) {
                value += bytes[i]
                    .toString(16)
                    .padStart(2, "0");
            }

            return (
                prefix +
                "_" +
                value
            );
        }


        return (
            prefix +
            "_" +
            Date.now().toString(36) +
            "_" +
            Math.random()
                .toString(36)
                .slice(2)
        );
    }


    /*
     * --------------------------------------------------
     * CLEAN
     * --------------------------------------------------
     */

    function clean(value, max) {

        if (
            value === null ||
            value === undefined
        ) {
            return null;
        }

        const result =
            String(value).trim();

        if (!result) {
            return null;
        }

        return result.slice(
            0,
            max
        );
    }


    /*
     * --------------------------------------------------
     * DOMAIN
     * --------------------------------------------------
     */

    function validHost() {

        const host =
            location.hostname
                .toLowerCase()
                .replace(/\.$/, "");

        const root =
            CONFIG.rootDomain
                .toLowerCase()
                .replace(/\.$/, "");


        return (
            host === root ||
            host.endsWith("." + root)
        );
    }


    function currentSite() {

        return location.hostname
            .toLowerCase()
            .replace(/\.$/, "");
    }


    /*
     * --------------------------------------------------
     * QUERY PARAMETERS
     * --------------------------------------------------
     */

    function query(
        name,
        max
    ) {

        try {

            return clean(
                new URLSearchParams(
                    location.search
                ).get(name),
                max
            );

        } catch {

            return null;
        }
    }


    /*
     * --------------------------------------------------
     * VISITOR
     * --------------------------------------------------
     */

    function getVisitor() {

        let value =
            storageGet(
                localStorage,
                VISITOR_KEY
            );


        if (value) {

            isNewVisitor = false;

            return value;
        }


        value =
            randomId("visitor");


        storageSet(
            localStorage,
            VISITOR_KEY,
            value
        );


        isNewVisitor = true;


        return value;
    }


    /*
     * --------------------------------------------------
     * SESSION
     * --------------------------------------------------
     */

    function getSession() {

        let id =
            storageGet(
                sessionStorage,
                SESSION_KEY
            );


        let start =
            Number(
                storageGet(
                    sessionStorage,
                    SESSION_START_KEY
                )
            );


        const now =
            Date.now();


        if (
            !id ||
            !start ||
            now - start >
                CONFIG.sessionTimeout
        ) {

            id =
                randomId("session");

            start =
                now;


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


    /*
     * --------------------------------------------------
     * DEVICE
     * --------------------------------------------------
     */

    function getDevice() {

        const ua =
            navigator.userAgent || "";


        const width =
            Math.max(
                document.documentElement
                    .clientWidth || 0,
                window.innerWidth || 0
            );


        if (
            /ipad|tablet/i.test(ua) ||
            (
                width >= 600 &&
                width <= 1200
            )
        ) {
            return "tablet";
        }


        if (
            /mobile|android|iphone|ipod|windows phone/i
                .test(ua)
        ) {
            return "mobile";
        }


        return "desktop";
    }


    /*
     * --------------------------------------------------
     * OS
     * --------------------------------------------------
     */

    function getOS() {

        const ua =
            navigator.userAgent || "";


        if (
            /Windows NT/i.test(ua)
        ) {
            return "Windows";
        }


        if (
            /Android/i.test(ua)
        ) {
            return "Android";
        }


        if (
            /iPhone|iPad|iPod/i.test(ua)
        ) {
            return "iOS";
        }


        if (
            /Mac OS X/i.test(ua)
        ) {
            return "macOS";
        }


        if (
            /CrOS/i.test(ua)
        ) {
            return "ChromeOS";
        }


        if (
            /Linux/i.test(ua)
        ) {
            return "Linux";
        }


        return "Unknown";
    }


    /*
     * --------------------------------------------------
     * BROWSER
     * --------------------------------------------------
     */

    function getBrowser() {

        const ua =
            navigator.userAgent || "";


        if (
            /Edg\//i.test(ua)
        ) {
            return "Edge";
        }


        if (
            /OPR\//i.test(ua)
        ) {
            return "Opera";
        }


        if (
            /Firefox\//i.test(ua)
        ) {
            return "Firefox";
        }


        if (
            /Chrome\//i.test(ua)
        ) {
            return "Chrome";
        }


        if (
            /Safari\//i.test(ua)
        ) {
            return "Safari";
        }


        return "Unknown";
    }


    /*
     * --------------------------------------------------
     * MARKETING
     * --------------------------------------------------
     */

    function getMarketing() {

        return {

            referrer:
                clean(
                    document.referrer,
                    512
                ),

            utm_source:
                query(
                    "utm_source",
                    128
                ),

            utm_medium:
                query(
                    "utm_medium",
                    128
                ),

            utm_campaign:
                query(
                    "utm_campaign",
                    128
                )
        };
    }


    /*
     * --------------------------------------------------
     * QUEUE
     * --------------------------------------------------
     */

    function saveQueue() {

        try {

            storageSet(
                localStorage,
                QUEUE_KEY,
                JSON.stringify(
                    queue.slice(
                        -CONFIG.maxQueue
                    )
                )
            );

        } catch (error) {

            warn(
                "Queue save failed:",
                error
            );
        }
    }


    function loadQueue() {

        try {

            const saved =
                storageGet(
                    localStorage,
                    QUEUE_KEY
                );


            if (!saved) {

                queue = [];

                return;
            }


            const parsed =
                JSON.parse(saved);


            queue =
                Array.isArray(parsed)
                    ? parsed.slice(
                        -CONFIG.maxQueue
                    )
                    : [];


            log(
                "Loaded queued events:",
                queue.length
            );

        } catch (error) {

            queue = [];

            warn(
                "Queue load failed:",
                error
            );
        }
    }


    /*
     * --------------------------------------------------
     * APPWRITE REST
     *
     * We use the official TablesDB REST endpoint
     * directly instead of dynamically loading the SDK.
     * --------------------------------------------------
     */

    async function createRow(
        databaseId,
        tableId,
        data,
        keepalive
    ) {

        const url =
            CONFIG.endpoint +
            "/tablesdb/" +
            encodeURIComponent(
                databaseId
            ) +
            "/tables/" +
            encodeURIComponent(
                tableId
            ) +
            "/rows";


        const body = {

            rowId:
                randomId("row"),

            data:
                data
        };


        log(
            "Sending row:",
            tableId,
            data
        );


        let response;


        try {

            response =
                await fetch(
                    url,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",

                            "X-Appwrite-Project":
                                CONFIG.projectId
                        },

                        body:
                            JSON.stringify(body),

                        keepalive:
                            !!keepalive,

                        credentials:
                            "omit"
                    }
                );

        } catch (networkError) {

            errorLog(
                "Network error:",
                networkError
            );

            throw networkError;
        }


        let responseText = "";


        try {

            responseText =
                await response.text();

        } catch {}


        if (!response.ok) {

            const message =
                "HTTP " +
                response.status +
                " " +
                response.statusText +
                " | " +
                responseText;


            errorLog(
                "Appwrite request failed:",
                message
            );


            throw new Error(message);
        }


        log(
            "Row created successfully:",
            tableId,
            responseText
        );


        return responseText;
    }


    /*
     * --------------------------------------------------
     * ADD EVENT
     * --------------------------------------------------
     */

    function addEvent(
        type,
        label
    ) {

        if (!started) {

            warn(
                "Event ignored because tracker is not started:",
                type
            );

            return;
        }


        const item = {

            databaseId:
                CONFIG.databaseId,

            tableId:
                CONFIG.eventsTable,

            data: {

                session_id:
                    sessionId,

                site_id:
                    currentSite(),

                visitor_id:
                    visitorId,

                event_type:
                    clean(type, 32),

                page_url:
                    clean(
                        location.href,
                        2048
                    ),

                page_title:
                    clean(
                        document.title,
                        255
                    ),

                target_label:
                    clean(
                        label,
                        255
                    ),

                timestamp:
                    new Date()
                        .toISOString()
            }
        };


        queue.push(item);


        if (
            queue.length >
            CONFIG.maxQueue
        ) {

            queue =
                queue.slice(
                    -CONFIG.maxQueue
                );
        }


        saveQueue();


        log(
            "Event queued:",
            type
        );


        if (
            queue.length >=
            CONFIG.batchSize
        ) {

            flush();
        }
    }


    /*
     * --------------------------------------------------
     * SESSION CREATION
     * --------------------------------------------------
     */

    async function createSession() {

        const alreadyCreated =
            storageGet(
                sessionStorage,
                SESSION_CREATED_KEY
            );


        if (alreadyCreated) {

            log(
                "Session already exists:",
                sessionId
            );

            return true;
        }


        const marketing =
            getMarketing();


        const data = {

            session_id:
                sessionId,

            site_id:
                currentSite(),

            visitor_id:
                visitorId,

            is_new:
                isNewVisitor,

            device:
                getDevice(),

            os:
                getOS(),

            browser:
                getBrowser(),

            language:
                clean(
                    navigator.language ||
                    "unknown",
                    10
                ),

            country:
                null,

            referrer:
                marketing.referrer,

            utm_source:
                marketing.utm_source,

            utm_medium:
                marketing.utm_medium,

            utm_campaign:
                marketing.utm_campaign,

            last_ping:
                new Date()
                    .toISOString(),

            duration:
                0
        };


        try {

            await createRow(
                CONFIG.databaseId,
                CONFIG.sessionsTable,
                data,
                false
            );


            storageSet(
                sessionStorage,
                SESSION_CREATED_KEY,
                "1"
            );


            log(
                "Session created:",
                sessionId
            );


            return true;

        } catch (error) {

            errorLog(
                "Session creation failed:",
                error
            );


            return false;
        }
    }


    /*
     * --------------------------------------------------
     * FLUSH
     * --------------------------------------------------
     */

    async function flush(
        keepalive
    ) {

        if (
            flushing ||
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


        log(
            "Flushing:",
            batch.length,
            "events"
        );


        for (
            const item of batch
        ) {

            try {

                await createRow(
                    item.databaseId,
                    item.tableId,
                    item.data,
                    !!keepalive
                );

            } catch (error) {

                failed.push(
                    item
                );

                errorLog(
                    "Event failed:",
                    error
                );
            }
        }


        if (failed.length) {

            queue =
                failed
                    .concat(queue)
                    .slice(
                        -CONFIG.maxQueue
                    );


            saveQueue();


            warn(
                "Failed events requeued:",
                failed.length
            );


            if (!keepalive) {

                setTimeout(
                    function () {
                        flush(false);
                    },
                    CONFIG.retryDelay
                );
            }

        } else {

            saveQueue();

            log(
                "Flush completed successfully."
            );
        }


        flushing = false;
    }


    /*
     * --------------------------------------------------
     * LABEL
     * --------------------------------------------------
     */

    function getLabel(
        element
    ) {

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


    /*
     * --------------------------------------------------
     * DOWNLOAD DETECTION
     * --------------------------------------------------
     */

    function isDownload(
        element
    ) {

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


        return /\.(zip|rar|7z|apk|mcpack|mcaddon|mcworld|mctemplate|pdf|exe|msi)(?:[?#].*)?$/i
            .test(href);
    }


    /*
     * --------------------------------------------------
     * CLICK TRACKING
     * --------------------------------------------------
     */

    function clickHandler(
        event
    ) {

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


        const type =
            isDownload(element)
                ? "download"
                : "click";


        addEvent(
            type,
            getLabel(element)
        );
    }


    /*
     * --------------------------------------------------
     * PAGEVIEW
     * --------------------------------------------------
     */

    function pageView() {

        addEvent(
            "pageview",
            null
        );
    }


    /*
     * --------------------------------------------------
     * SESSION PING
     * --------------------------------------------------
     */

    function ping() {

        if (!started) {
            return;
        }


        addEvent(
            "session_ping",
            null
        );


        flush(false);
    }


    /*
     * --------------------------------------------------
     * VISIBILITY
     * --------------------------------------------------
     */

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

            flush(true);
        }
    }


    /*
     * --------------------------------------------------
     * BEFORE UNLOAD
     * --------------------------------------------------
     */

    function beforeUnload() {

        saveQueue();


        /*
         * Try to send the current batch
         * before the page disappears.
         */

        if (queue.length) {

            flush(true);
        }
    }


    /*
     * --------------------------------------------------
     * START
     * --------------------------------------------------
     */

    async function start() {

        if (started) {
            return;
        }


        log(
            "Starting tracker..."
        );


        if (!validHost()) {

            warn(
                "Tracker stopped: invalid host.",
                location.hostname,
                "| allowed:",
                CONFIG.rootDomain
            );

            return;
        }


        loadQueue();


        visitorId =
            getVisitor();


        const session =
            getSession();


        sessionId =
            session.id;


        sessionStart =
            session.start;


        started = true;


        log(
            "Visitor:",
            visitorId
        );


        log(
            "Session:",
            sessionId
        );


        /*
         * Create session first.
         */

        await createSession();


        /*
         * Immediately create pageview.
         */

        pageView();


        /*
         * Event listeners.
         */

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


        /*
         * Periodic flushing.
         */

        flushTimer =
            setInterval(
                function () {
                    flush(false);
                },
                CONFIG.flushInterval
            );


        /*
         * Session ping.
         */

        pingTimer =
            setInterval(
                ping,
                CONFIG.pingInterval
            );


        /*
         * Send pageview immediately.
         */

        await flush(false);


        log(
            "Tracker started successfully."
        );
    }


    /*
     * --------------------------------------------------
     * PUBLIC API
     * --------------------------------------------------
     */

    window.ATTDESTracker = {

        track:
            function (
                type,
                label
            ) {

                addEvent(
                    type,
                    label
                );
            },


        pageview:
            function () {

                pageView();

                flush(false);
            },


        click:
            function (
                label
            ) {

                addEvent(
                    "click",
                    label
                );

                flush(false);
            },


        download:
            function (
                label
            ) {

                addEvent(
                    "download",
                    label
                );

                flush(false);
            },


        flush:
            function () {

                return flush(false);
            },


        status:
            function () {

                return {

                    started:
                        started,

                    visitorId:
                        visitorId,

                    sessionId:
                        sessionId,

                    queue:
                        queue.length,

                    host:
                        location.hostname
                };
            }
    };


    /*
     * --------------------------------------------------
     * INITIALIZE
     * --------------------------------------------------
     */

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            start,
            {
                once: true
            }
        );

    } else {

        start();
    }

})();