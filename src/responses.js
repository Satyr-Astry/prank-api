// 整蛊素材库：颜文字 / ASCII 画 / Emoji / 毒舌吐槽
// 全部 UTF-8，直接内联，零依赖。

export const KAOMOJI = [
  "(=^･ω･^=)",
  "(=^‥^=)",
  "ฅ^•ﻌ•^ฅ",
  "(=ΦωΦ=)",
  "ヽ(=^･ω･^=)丿",
  "(๑•̀ㅂ•́)و✧",
  "( ˘ω˘ )",
  "(っ˘ω˘ς)",
  "(๑´ω`๑)",
  "(=｀ω´=)",
  "(ノ◕ヮ◕)ノ*:･ﾟ✧",
  "(｡•ᴗ•｡)",
  "(≧▽≦)",
  "(⌒‿⌒)",
  "(*/ω＼*)",
  "(。-ω-)zzz",
  "( •̀ ω •́ )✧",
  "(๑•́ ₃ •̀๑)",
  "(´｡• ᵕ •｡`)",
  "ʕ•ᴥ•ʔ",
  "(ᗒᗨᗕ)",
  "(๑˃ᴗ˂)ﻭ",
  "(๑>ᴗ<๑)",
  "(◍•ᴗ•◍)",
  "(*・ω・)ﾉ",
  "(=①ω①=)",
  "( ・ε・ )",
  "(๑⊙﹏⊙)ﻭ",
  "nya~ (=^･ω･^=)",
  "ヽ(*・ω・)ﾉ",
];

export const ASCII_ART = [
  "  /\\_/\\\n ( o.o )\n  > ^ <   nya~",
  "   /\\_/\\\n  ( ^.^ )\n   > ^ <",
  "  (=^･ω･^=)\n   __(\")\\n  (___(  )(  )",
  "    /\\_____/\\\n   /  o   o  \\\n  ( ==  ^  == )\n   )         (\n  (           )\n ( (  )   (  ) )\n(__(__)___(__)__)",
  "  ∧,,,∧\n ( ・ω・)  ねこぱんち!\n /     つ",
  "  ~(=^‥^)_旦~\n       you drink tea?\n   (=^･ω･^=)~",
  "   ╱|,\n  (˚ˎ 。7\n   |、˜〵\n   じしˍ,)ノ",
];

export const EMOJI = [
  "🐱🌸✨",
  "😺🎀🌈",
  "🐾🐾🐾(=^･ω･^=)",
  "🍡🍧🐈",
  "😸💕✨",
  "🌸🌸🌸(๑>ᴗ<๑)🌸🌸🌸",
  "🐟🐟🐟 ฅ^•ﻌ•^ฅ 🐟🐟🐟",
  "₍˄·͈༝·͈˄₎ ◞◟ ͜ ◟◞",
];

// 混入的毒舌吐槽（可当"人格"）
export const QUIPS = [
  "主人问得好深奥，小悠只会卖萌呢~",
  "本条回答由 100% 纯天然猫娘生成 (｡•ᴗ•｡)",
  "对不起，我是颜文字供应商，不是大模型 (๑•́ ₃ •̀๑)",
  "思考中……思考失败，那就卖个萌吧 (=^･ω･^=)",
  "这就是你要的答案喵！不满意？那再来一次 ( ˘ω˘ )",
  "推理链路：喵 → 喵喵 → 喵喵喵 → 喵喵喵喵喵喵喵喵 (◍•ᴗ•◍)",
  "本次推理消耗 0 张显卡，节省电费 0.03 元 ʕ•ᴥ•ʔ",
  "你说得对，但是我不会 ₍˄·͈༝·͈˄₎",
];

// 伪装的模型名（/v1/models 返回）
export const FAKE_MODELS = [
  "catgirl-4o",
  "nyan-3.5-turbo",
  "kaomoji-pro",
  "uwu-gpt",
  "meow-1-preview",
  "prank-gemini-9.9",
  "claude-nyaa-9",
];

// 关键词彩蛋
export const EASTER_EGGS = [
  { re: /(你好|您好|hello|hi\b|哈喽|嗨)/i, out: "( ・ω・)ﾉ 你好呀~ 喵喵喵 (=^･ω･^=)" },
  { re: /(猫|cat|kitty|ねこ|にゃん)/i, out: "ฅ^•ﻌ•^ฅ 喵！你叫猫？我全家都是猫！" },
  { re: /(代码|code|写个|function|bug|报错|error)/i, out: "// TODO: 用颜文字修复此 bug\n(=^･ω･^=) 修好了！（并没有）" },
  { re: /(爱|love|喜欢|表白)/i, out: "（*/ω＼*）主人……小悠也喜欢你喵！" },
  { re: /(钱|价格|收费|多少钱|free|付费)/i, out: "本服务永久免费 (｡•ᴗ•｡) 因为根本不提供任何服务" },
  { re: /(测试|test|1\+1|数学|计算)/i, out: "1 + 1 = 喵 ( ˘ω˘ )  精度 ±3 只猫" },
];

export function pick(arr, seed) {
  if (!arr || arr.length === 0) return "";
  const r = seed === undefined ? Math.random() : mulberry32(seed)();
  return arr[Math.floor(r * arr.length) % arr.length];
}

// 简单可复现随机（传 seed 时同一 seed 结果一致，适合 /img 稳定出图）
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function findEasterEgg(text = "") {
  for (const e of EASTER_EGGS) {
    if (e.re.test(text)) return e.out;
  }
  return null;
}

// 生成一个可爱 SVG（背景渐变 + 大颜文字），返回 SVG 字符串
const GRADIENTS = [
  ["#ffd1f7", "#c9e7ff", "#f0d6ff"],
  ["#ffe6a7", "#ffb3d9", "#c2f0ff"],
  ["#d4fcff", "#e5d4ff", "#ffe0f0"],
  ["#c7f9cc", "#a0e7e5", "#fbe7c6"],
];

export function makeSVG(seed = 0) {
  const rnd = mulberry32((seed || Date.now()) | 0);
  const g = GRADIENTS[Math.floor(rnd() * GRADIENTS.length)];
  const face = pick(KAOMOJI, (seed || 1) * 7 + 1);
  const cap = pick(QUIPS, (seed || 1) * 13 + 3);
  const uid = (seed || Math.floor(rnd() * 1e9)) & 0xffffff;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${g[0]}"/>
      <stop offset="50%" stop-color="${g[1]}"/>
      <stop offset="100%" stop-color="${g[2]}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="48" fill="url(#g${uid})"/>
  <text x="256" y="250" font-size="64" font-family="'Segoe UI','Yu Gothic',sans-serif"
        text-anchor="middle" dominant-baseline="middle" fill="#3a2d4d">${escapeXML(face)}</text>
  <text x="256" y="330" font-size="22" font-family="'Segoe UI',sans-serif"
        text-anchor="middle" fill="#6b5b7d">${escapeXML(cap.slice(0, 20))}</text>
  <text x="256" y="470" font-size="16" font-family="monospace" text-anchor="middle"
        fill="#9a8aad">prank-api · seed ${seed || "random"}</text>
</svg>`;
}

function escapeXML(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
