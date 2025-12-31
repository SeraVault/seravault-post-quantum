"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getI18n = exports.initI18n = void 0;
const i18next_1 = __importDefault(require("i18next"));
const i18next_fs_backend_1 = __importDefault(require("i18next-fs-backend"));
const path = __importStar(require("path"));
// Initialize i18next for server-side translations
let isInitialized = false;
async function initI18n() {
    if (isInitialized)
        return;
    await i18next_1.default
        .use(i18next_fs_backend_1.default)
        .init({
        fallbackLng: 'en',
        supportedLngs: ['en', 'es', 'fr'],
        ns: ['notifications'],
        defaultNS: 'notifications',
        backend: {
            loadPath: path.join(__dirname, '../locales/{{lng}}/{{ns}}.json'),
        },
        interpolation: {
            escapeValue: false, // Not needed for server-side
        },
    });
    isInitialized = true;
}
exports.initI18n = initI18n;
/**
 * Get translated notification strings for a specific language
 * @param language User's preferred language (en, es, fr)
 * @returns i18next instance with the language set
 */
async function getI18n(language = 'en') {
    await initI18n();
    return i18next_1.default.getFixedT(language, 'notifications');
}
exports.getI18n = getI18n;
//# sourceMappingURL=i18n.js.map