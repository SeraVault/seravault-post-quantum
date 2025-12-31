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
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTemplateData = exports.getAvailableTemplates = exports.renderEmailTemplate = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Load and render an email template
 * Supports simple {{variable}} replacement and {{#if condition}} blocks
 */
function renderEmailTemplate(templateName, data, language = 'en') {
    // Try language-specific template first (e.g., invitation-email-fr.html)
    let templatePath = path.join(__dirname, '..', 'templates', `${templateName}-${language}.html`);
    // Fallback to base template if language-specific doesn't exist
    if (!fs.existsSync(templatePath)) {
        templatePath = path.join(__dirname, '..', 'templates', `${templateName}.html`);
    }
    if (!fs.existsSync(templatePath)) {
        throw new Error(`Email template not found: ${templateName}`);
    }
    let template = fs.readFileSync(templatePath, 'utf-8');
    // Handle {{#if condition}} ... {{/if}} blocks
    template = template.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, content) => {
        return data[condition] ? content : '';
    });
    // Replace {{variable}} placeholders
    template = template.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
        const value = data[variable];
        return value !== undefined ? String(value) : match;
    });
    return template;
}
exports.renderEmailTemplate = renderEmailTemplate;
/**
 * Get available email templates
 */
function getAvailableTemplates() {
    const templatesDir = path.join(__dirname, '..', 'templates');
    if (!fs.existsSync(templatesDir)) {
        return [];
    }
    return fs.readdirSync(templatesDir)
        .filter(file => file.endsWith('.html'))
        .map(file => file.replace('.html', ''));
}
exports.getAvailableTemplates = getAvailableTemplates;
/**
 * Validate that all required variables are present in data
 */
function validateTemplateData(template, data) {
    const variableRegex = /\{\{(\w+)\}\}/g;
    const matches = template.matchAll(variableRegex);
    const missing = [];
    for (const match of matches) {
        const variable = match[1];
        if (data[variable] === undefined) {
            missing.push(variable);
        }
    }
    return {
        valid: missing.length === 0,
        missing
    };
}
exports.validateTemplateData = validateTemplateData;
//# sourceMappingURL=emailTemplates.js.map