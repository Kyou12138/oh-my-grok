/**
 * Idle / empty assistant turn detection — yank agent back when work remains.
 */
const FLUFF = /^(ok|okay|sure|sure thing|yes|no|done|thanks|thank you|thx|ty|yep|yup|nope|cool|great|perfect|awesome|noted|alright|lgtm|sgtm|wfm|wip|continue|resuming|resume|all set|all good|ship it|shipping|you got it|can do|no problem|no worries|no issue|fine|fine by me|works for me|gotcha|makes sense|fair enough|clear|roger|copy|np|kk|继续|好的|好的呀|好哒|好吧|好嘞|嗯|嗯嗯|哦|行|行吧|可以|可以可以|收到|明白|了解|知道了|懂了|懂|我明白了|我懂了|稍后|一会|没问题|了解了|着手处理|搞定|就这样|那就这样|\.{1,6}|…+|👍|✅)[.。!?！？]?$/i;
export function isIdleAssistantMessage(msg) {
    if (msg === undefined || msg === null)
        return true;
    const t = msg.trim();
    if (!t)
        return true;
    if (t.length <= 2)
        return true;
    if (FLUFF.test(t))
        return true;
    // "I'll continue shortly." / "let me proceed" — no concrete deliverable
    // v1.1.50: Looking into it / One moment / Hang on / Bear with me
    // v1.1.51: investigate / digging in / proceeding / almost there
    // v1.1.52: sure thing / jumping in / ship it / moving on
    if (/^i('ll| will)\s+(continue|get (right )?on it|do that|proceed|take a look|investigate|handle it|fix it|fix that|check)\b/i.test(t) ||
        /^let me (continue|proceed|check|investigate)\b/i.test(t) ||
        /^continuing(\s+shortly)?[\s.]*$/i.test(t) ||
        /^(working on it|on it|on it now|got it|understood|will do|will do that|will do shortly)[\s.]*$/i.test(t) ||
        /^(looking into it|taking a look|checking now|checking|one moment|one sec|hang on|stand by|acknowledged|sounds good|right away|coming right up|give me a moment|just a second|bear with me|investigating|digging in|digging into it|diving in|starting now|starting work|kicking off|here we go|proceeding|proceeding now|in progress|making progress|almost there|nearly done|stay tuned|more soon|back in a bit|brb|copy that|alright then|sure thing|you got it|can do|on my way|jumping in|hopping on it|moving on|moving forward|all set|all good|ship it|shipping|looks good|looks fine|seems fine)[\s.]*$/i.test(t)) {
        return true;
    }
    // Chinese status fluff without paths/tools (v1.1.13 + v1.1.50–53)
    if (t.length < 48 &&
        /^(稍等|等一下|马上|即将|稍后继续|稍后回复|我先看看|我来看看|我看一下|我去查一下|我去看下|查一下|看一下|看下|查下|研究一下|分析一下|先这样|好的我继续|继续处理|马上处理|这就开始|正在处理|处理中|着手处理|先摸一下|排查中|调试中|开发中|进行中|等我一下|请稍候|请稍等|回头再说|我试试|试试看|试一下|测一下|跑一下|弄一下|搞一下|处理一下|改一下|修一下|马上就好|马上改|马上修|这就改|这就修|先改|先修|先看|先查|先跑|先测|改完了再说|别急|稍安勿躁|莫急)/.test(t)) {
        return true;
    }
    // pure ellipsis / emoji noise
    if (/^[\s.。…·•\-–—*⭐✨🚀✅❌]+$/u.test(t))
        return true;
    // short status with no path/code/marker
    if (t.length < 40 &&
        !/[\\/]|\.(ts|tsx|js|py|go|rs|md)\b|promise>|TODO|fix|test|edit|read|spawn|implement/i.test(t)) {
        if (/^(i |i'm |im |we |let me |going to |trying )/i.test(t))
            return true;
    }
    return false;
}
export function idleTurnStopReason(context) {
    return [
        "IDLE TURN DETECTED — no concrete progress in the last reply.",
        context,
        "",
        "Continue with a real action:",
        "1) Read/search a file, or",
        "2) Edit code (`search_replace` / Write), or",
        "3) Run tests / diagnostics, or",
        "4) **task** + **get_task_output** if waiting on a subagent",
        "Do not reply with only 'ok' / '继续' / '稍等' / status fluff.",
    ].join("\n");
}
//# sourceMappingURL=idle-turn.js.map