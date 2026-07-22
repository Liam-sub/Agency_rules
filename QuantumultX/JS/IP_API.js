// ========================================
// IP Info Panel
// Compatible: Quantumult X / Surge / Loon
// ========================================

if (!$response || $response.statusCode !== 200) {
    $done(null);
}

const DEFAULT_CITY = "未知城市";
const DEFAULT_ISP = "未知运营商";

const flags = new Map([
["AC","🇦🇨"],["AF","🇦🇫"],["AI","🇦🇮"],["AL","🇦🇱"],["AM","🇦🇲"],
["AQ","🇦🇶"],["AR","🇦🇷"],["AS","🇦🇸"],["AT","🇦🇹"],["AU","🇦🇺"],
["AW","🇦🇼"],["AX","🇦🇽"],["AZ","🇦🇿"],["BB","🇧🇧"],["BD","🇧🇩"],
["BE","🇧🇪"],["BF","🇧🇫"],["BG","🇧🇬"],["BH","🇧🇭"],["BI","🇧🇮"],
["BJ","🇧🇯"],["BM","🇧🇲"],["BN","🇧🇳"],["BO","🇧🇴"],["BR","🇧🇷"],
["BS","🇧🇸"],["BT","🇧🇹"],["BV","🇧🇻"],["BW","🇧🇼"],["BY","🇧🇾"],
["BZ","🇧🇿"],["CA","🇨🇦"],["CF","🇨🇫"],["CH","🇨🇭"],["CK","🇨🇰"],
["CL","🇨🇱"],["CM","🇨🇲"],["CN","🇨🇳"],["CO","🇨🇴"],["CR","🇨🇷"],
["CU","🇨🇺"],["CV","🇨🇻"],["CW","🇨🇼"],["CX","🇨🇽"],["CY","🇨🇾"],
["CZ","🇨🇿"],["DE","🇩🇪"],["DJ","🇩🇯"],["DK","🇩🇰"],["DM","🇩🇲"],
["DO","🇩🇴"],["DZ","🇩🇿"],["EC","🇪🇨"],["EE","🇪🇪"],["EG","🇪🇬"],
["ER","🇪🇷"],["ES","🇪🇸"],["ET","🇪🇹"],["EU","🇪🇺"],["FI","🇫🇮"],
["FJ","🇫🇯"],["FK","🇫🇰"],["FM","🇫🇲"],["FO","🇫🇴"],["FR","🇫🇷"],
["GA","🇬🇦"],["GB","🇬🇧"],["GR","🇬🇷"],["HK","🇭🇰"],["HR","🇭🇷"],
["HU","🇭🇺"],["ID","🇮🇩"],["IE","🇮🇪"],["IL","🇮🇱"],["IM","🇮🇲"],
["IN","🇮🇳"],["IS","🇮🇸"],["IT","🇮🇹"],["JP","🇯🇵"],["KR","🇰🇷"],
["LU","🇱🇺"],["MO","🇲🇴"],["MX","🇲🇽"],["MY","🇲🇾"],["NL","🇳🇱"],
["NO","🇳🇴"],["NZ","🇳🇿"],["PH","🇵🇭"],["PL","🇵🇱"],["PT","🇵🇹"],
["RO","🇷🇴"],["RS","🇷🇸"],["RU","🇷🇺"],["SA","🇸🇦"],["SE","🇸🇪"],
["SG","🇸🇬"],["TH","🇹🇭"],["TR","🇹🇷"],["TW","🇹🇼"],["UK","🇬🇧"],
["US","🇺🇸"],["UY","🇺🇾"],["VN","🇻🇳"]
]);

function safe(value, fallback) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }
    return value;
}

let obj;

try {
    obj = JSON.parse($response.body);
} catch (e) {
    $done({
        title: "❌ IP 信息获取失败",
        subtitle: "JSON Parse Error",
        description: e.toString()
    });
}

const countryCode = safe(obj.countryCode, "");
const country = safe(obj.country, "Unknown");
const city = safe(obj.city, DEFAULT_CITY);
const region = safe(obj.regionName, DEFAULT_CITY);
const isp = safe(obj.isp, DEFAULT_ISP);
const org = safe(obj.org, isp);
const ip = safe(obj.query, "--");
const timezone = safe(obj.timezone, "--");

const flag = flags.get(countryCode) || "🏳️";

const title = `${flag} ${country}`;
const subtitle = `✈️ ${city} (${org})`;
const description =
`服务商：${isp}
地区：${region}
IP：${ip}
时区：${timezone}`;

$done({
    title,
    subtitle,
    ip,
    description
});
