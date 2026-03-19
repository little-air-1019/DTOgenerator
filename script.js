// script.js

// --- Initialization ---
const jsonEditor = ace.edit("jsonEditor");
jsonEditor.setTheme("ace/theme/monokai");
jsonEditor.session.setMode("ace/mode/json");
jsonEditor.setOptions({ fontSize: "12pt", showPrintMargin: false });

const outputEditor = ace.edit("outputEditor");
outputEditor.setTheme("ace/theme/monokai");
outputEditor.session.setMode("ace/mode/java");
outputEditor.setOptions({ fontSize: "12pt", showPrintMargin: false, readOnly: true });

const sampleJson = {
    "TRANRQ": {
        "caseList": [
            {
                "caseId": "20240619",
                "caseType": "INQUIRY",
                "flows": {
                    "basicInfo": {
                        "firstName": "Yong Sun",
                        "lastName": "Kim",
                        "age": 34
                    }
                }
            }
        ]
    }
};
jsonEditor.setValue(JSON.stringify(sampleJson, null, 2), -1);

let jsonStructure = null;
let fieldConfigurations = {};
let currentField = null;
let isRequest = false;
let rootClassName = "";
let classesMap = {};
let classValidationMap = {};

const programNameInput = document.getElementById('programName');
const programNameError = document.getElementById('programNameError');
const generateBtn = document.getElementById('generateBtn');
const copyBtn = document.getElementById('copyBtn');
const beautifyBtn = document.getElementById('beautifyBtn');
const javaVersionSelect = document.getElementById('javaVersion');
const structurePanel = document.getElementById('structurePanel');
const structureContainer = document.getElementById('structureContainer');
const fieldModal = document.getElementById('fieldModal');
const closeModal = document.getElementById('closeModal');
const saveFieldConfig = document.getElementById('saveFieldConfig');
const fieldTypeSelect = document.getElementById('fieldType');
const customTypeContainer = document.getElementById('customTypeContainer');
const customTypeInput = document.getElementById('customType');

function validateProgramName() {
    if (!programNameInput.value.trim()) {
        programNameError.classList.remove('hidden');
        return false;
    }
    programNameError.classList.add('hidden');
    return true;
}
generateBtn.addEventListener('click', (e) => {
    if (!validateProgramName()) {
        e.preventDefault();
        return;
    }

    try {
        const jsonInput = jsonEditor.getValue();
        const jsonObj = JSON.parse(jsonInput);

        if (jsonObj.TRANRQ) {
            jsonStructure = jsonObj.TRANRQ;
            isRequest = true;
        } else if (jsonObj.TRANRS) {
            jsonStructure = jsonObj.TRANRS;
            isRequest = false;
        } else {
            throw new Error("JSON must contain either TRANRQ or TRANRS as the root object");
        }

        const programName = programNameInput.value.trim();
        if (!programName) {
            throw new Error("Program name is required");
        }

        rootClassName = programName + (isRequest ? "Tranrq" : "Tranrs");
        fieldConfigurations = {};
        displayStructure(jsonStructure, rootClassName);
        structurePanel.classList.remove('hidden');

        classesMap = extractClasses(jsonStructure, rootClassName);
        classValidationMap = computeValidationNeeds(classesMap);
        let javaCode = '';
        for (const className in classesMap) {
            javaCode += generateClass(className, classesMap[className]) + '\n\n';
        }
        outputEditor.setValue(javaCode, -1);
    } catch (error) {
        alert("Error generating DTO classes: " + error.message);
    }
});

beautifyBtn.addEventListener('click', () => {
    try {
        const json = jsonEditor.getValue();
        const obj = JSON.parse(json);
        jsonEditor.setValue(JSON.stringify(obj, null, 2), -1);
    } catch (error) {
        alert('Invalid JSON: ' + error.message);
    }
});


const copyToClipboard = () => {
    const code = outputEditor.getValue();
    if (!code) return alert("No code to copy");

    navigator.clipboard.writeText(code).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = "Copied!";
        copyBtn.classList.replace('bg-blue-600', 'bg-green-600');
        copyBtn.classList.replace('hover:bg-blue-700', 'hover:bg-green-700');
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.classList.replace('bg-green-600', 'bg-blue-600');
            copyBtn.classList.replace('hover:bg-green-700', 'hover:bg-blue-700');
        }, 2000);
    }).catch(err => alert("Failed to copy: " + err));
}

closeModal.addEventListener('click', closeFieldModal);
saveFieldConfig.addEventListener('click', saveFieldConfiguration);

fieldTypeSelect.addEventListener('change', function () {
    if (this.value === 'Others') {
        customTypeContainer.classList.remove('hidden');
    } else {
        customTypeContainer.classList.add('hidden');
    }
});

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function isStandardType(type) {
    const standardTypes = ['String', 'Integer', 'Long', 'Double', 'Boolean', 'BigDecimal', 'LocalDate', 'LocalDateTime', 'Timestamp'];
    return standardTypes.includes(type);
}

function isNumericType(type) {
    const numericTypes = ['Integer', 'Long', 'Short', 'BigInteger', 'Double', 'Float', 'BigDecimal'];
    return numericTypes.includes(type);
}

function getBaseType(type) {
    return type.startsWith('List<') ? type.slice(5, -1) : type;
}

function classHasValidation(className, classes, fieldConfigs) {
    // Recursively check if this class or any of its nested children have validation
    const fields = classes[className];
    if (!fields) return false;

    for (const field of fields) {
        const path = `${className}.${field.name}`;
        const cfg = fieldConfigs[path];

        // Check if field has validation annotations
        if (cfg && (cfg.required || cfg.maxLength)) {
            return true;
        }

        // Check nested objects recursively
        const baseType = getBaseType(cfg.type);
        if (!isStandardType(baseType) && classes[baseType]) {
            if (classHasValidation(baseType, classes, fieldConfigs)) {
                return true;
            }
        }
    }

    return false;
}

function computeValidationNeeds(classes) {
    // Build a map of which classes need validation
    const validationMap = {};
    for (const className in classes) {
        validationMap[className] = classHasValidation(className, classes, fieldConfigurations);
    }
    return validationMap;
}

function displayStructure(obj, path) {
    structureContainer.innerHTML = '';
    const classes = extractClasses(obj, path);

    for (const className in classes) {
        const classDiv = document.createElement('div');
        classDiv.className = 'p-4 border border-gray-200 rounded-md';

        const classHeader = document.createElement('h3');
        classHeader.className = 'text-lg font-semibold text-primary-700 mb-2';
        classHeader.textContent = className;
        classDiv.appendChild(classHeader);

        const fieldsList = document.createElement('div');
        fieldsList.className = 'space-y-2';

        for (const field of classes[className]) {
            const fieldPath = `${className}.${field.name}`;
            if (!fieldConfigurations[fieldPath]) {
                fieldConfigurations[fieldPath] = {
                    name: field.name,
                    type: field.isList ? `List<${field.type}>` : field.type,
                    required: false,
                    maxLength: '',
                    jsonAlias: '',
                    comment: '',
                    customType: ''
                };
            }

            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'flex items-center justify-between p-2 bg-gray-50 rounded';

            const fieldInfo = document.createElement('div');
            fieldInfo.innerHTML = `<span class="font-medium">${field.name}</span>: <span class="text-green-600">${fieldConfigurations[fieldPath].type}</span>`;

            const configBtn = document.createElement('button');
            configBtn.className = 'px-2 py-1 bg-primary-100 text-primary-700 rounded hover:bg-primary-200 text-sm';
            configBtn.textContent = 'Configure';
            configBtn.onclick = () => openFieldModal(fieldPath);

            fieldDiv.appendChild(fieldInfo);
            fieldDiv.appendChild(configBtn);
            fieldsList.appendChild(fieldDiv);
        }

        classDiv.appendChild(fieldsList);
        structureContainer.appendChild(classDiv);
    }
}

function extractClasses(obj, rootName) {
    const classes = {};

    function processObject(obj, className, parentPath = '') {
        if (!classes[className]) {
            classes[className] = [];
        }

        for (const key in obj) {
            const value = obj[key];
            const fieldPath = parentPath ? `${parentPath}.${key}` : key;

            if (Array.isArray(value)) {
                if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
                    let itemClassName = key.endsWith('List') ? key.slice(0, -4) : key;
                    itemClassName = className + capitalize(itemClassName);
                    classes[className].push({ name: key, type: itemClassName, isList: true });
                    processObject(value[0], itemClassName, fieldPath);
                } else {
                    classes[className].push({ name: key, type: 'String', isList: true });
                }
            } else if (typeof value === 'object' && value !== null) {
                const nestedClassName = className + capitalize(key);
                classes[className].push({ name: key, type: nestedClassName, isList: false });
                processObject(value, nestedClassName, fieldPath);
            } else {
                let type = 'String';
                if (typeof value === 'number') type = Number.isInteger(value) ? 'Integer' : 'Double';
                if (typeof value === 'boolean') type = 'Boolean';
                classes[className].push({ name: key, type: type, isList: false });
            }
        }
    }

    processObject(obj, rootName);
    return classes;
}

function openFieldModal(fieldPath) {
    currentField = fieldPath;
    const config = fieldConfigurations[fieldPath];
    document.getElementById('fieldName').value = config.name;
    const baseType = config.type.startsWith('List<') ? config.type.slice(5, -1) : config.type;

    if (isStandardType(baseType)) {
        fieldTypeSelect.value = baseType;
        customTypeContainer.classList.add('hidden');
    } else {
        fieldTypeSelect.value = 'Others';
        customTypeInput.value = config.customType || baseType;
        customTypeContainer.classList.remove('hidden');
    }

    document.getElementById('fieldRequired').checked = config.required;
    document.getElementById('fieldMaxLength').value = config.maxLength;
    document.getElementById('fieldJsonAlias').value = config.jsonAlias;
    document.getElementById('fieldComment').value = config.comment;

    fieldModal.classList.remove('opacity-0', 'pointer-events-none');
    fieldModal.classList.add('opacity-100');
    document.querySelector('.modal-container').classList.remove('scale-95');
    document.querySelector('.modal-container').classList.add('scale-100');
}

function closeFieldModal() {
    fieldModal.classList.add('opacity-0', 'pointer-events-none');
    fieldModal.classList.remove('opacity-100');
    document.querySelector('.modal-container').classList.add('scale-95');
    document.querySelector('.modal-container').classList.remove('scale-100');
}

function saveFieldConfiguration() {
    if (!currentField) return;
    const config = fieldConfigurations[currentField];
    const selectedType = fieldTypeSelect.value;

    if (selectedType === 'Others') {
        const customType = customTypeInput.value.trim();
        if (!customType) {
            alert("Custom type cannot be empty");
            return;
        }
        config.type = config.type.startsWith('List<') ? `List<${customType}>` : customType;
        config.customType = customType;
    } else {
        config.type = config.type.startsWith('List<') ? `List<${selectedType}>` : selectedType;
        config.customType = '';
    }

    config.required = document.getElementById('fieldRequired').checked;
    config.maxLength = document.getElementById('fieldMaxLength').value;
    config.jsonAlias = document.getElementById('fieldJsonAlias').value;
    config.comment = document.getElementById('fieldComment').value;

    displayStructure(jsonStructure, rootClassName);
    closeFieldModal();

    // Re-generate DTO after saving field configuration
    if (jsonStructure && rootClassName) {
        classesMap = extractClasses(jsonStructure, rootClassName);
        classValidationMap = computeValidationNeeds(classesMap);
        let javaCode = '';
        for (const className in classesMap) {
            javaCode += generateClass(className, classesMap[className]) + '\n\n';
        }
        outputEditor.setValue(javaCode, -1);
    }
}

// --- Utility: type import map ---
const TYPE_IMPORTS = {
    BigDecimal: 'import java.math.BigDecimal;',
    LocalDate: 'import java.time.LocalDate;',
    LocalDateTime: 'import java.time.LocalDateTime;',
    Timestamp: 'import java.sql.Timestamp;'
};

// --- Utility: camelCase conversion ---
function toCamelCase(str) {
    return str.replace(/^[A-Z]/, m => m.toLowerCase())
        .replace(/_([a-zA-Z])/g, (_, c) => c.toUpperCase());
}

// --- Utility: get validation package ---
function getValidationPackage() {
    return javaVersionSelect.value === 'jakarta'
        ? 'jakarta.validation.constraints'
        : 'javax.validation.constraints';
}

// --- JSON Mode: Code Generation ---
function generateClass(className, fields) {
    const validationPackage = getValidationPackage();
    const imports = new Set([
        'import lombok.Data;',
        'import java.io.Serial;',
        'import java.io.Serializable;',
        'import com.fasterxml.jackson.annotation.JsonProperty;'
    ]);

    for (const field of fields) {
        const path = `${className}.${field.name}`;
        const cfg = fieldConfigurations[path];
        const baseType = getBaseType(cfg.type);

        if (cfg.jsonAlias) imports.add('import com.fasterxml.jackson.annotation.JsonAlias;');
        if (cfg.required) {
            const annotationType = baseType === 'String' ? 'NotBlank'
                : cfg.type.startsWith('List<') ? 'NotEmpty' : 'NotNull';
            imports.add(`import ${validationPackage}.${annotationType};`);
        }

        if (cfg.maxLength) {
            imports.add(`import ${validationPackage}.${isNumericType(baseType) ? 'Max' : 'Size'};`);
        }

        if (!isStandardType(baseType) && classesMap[baseType] && classValidationMap[baseType]) {
            imports.add(javaVersionSelect.value === 'jakarta' ? 'import jakarta.validation.Valid;' : 'import javax.validation.Valid;');
        }

        if (TYPE_IMPORTS[baseType]) imports.add(TYPE_IMPORTS[baseType]);
        if (cfg.type.startsWith('List<')) imports.add('import java.util.List;');
    }

    let code = `${Array.from(imports).sort().join('\n')}\n\n@Data\n`;
    code += `public class ${className} implements Serializable {\n\n`;
    code += '    /** serialVersionUID */\n';
    code += '    private static final long serialVersionUID = 1L;\n\n';
    code += fields.map(field => generateField(className, field, validationPackage)).join('\n');
    code += '}';

    return code;
}

function generateField(className, field, validationPackage) {
    const path = `${className}.${field.name}`;
    const cfg = fieldConfigurations[path];
    const baseType = getBaseType(cfg.type);
    const annotations = [];

    if (cfg.comment) annotations.push(`    /** ${cfg.comment} */`);

    annotations.push(`    @JsonProperty("${field.name}")`);

    if (cfg.jsonAlias) {
        const aliases = cfg.jsonAlias.split(',').map(a => `"${a.trim()}"`).join(', ');
        annotations.push(`    @JsonAlias(${aliases})`);
    }

    if (!isStandardType(baseType) && classesMap[baseType] && classValidationMap[baseType]) {
        annotations.push(`    @Valid`);
    }

    if (cfg.required) {
        const message = `${field.name} 不得為空`;
        const annotationType = baseType === 'String' ? 'NotBlank'
            : cfg.type.startsWith('List<') ? 'NotEmpty' : 'NotNull';
        annotations.push(`    @${annotationType}(message="${message}")`);
    }

    if (cfg.maxLength) {
        if (isNumericType(baseType)) {
            const maxValue = Math.pow(10, parseInt(cfg.maxLength)) - 1;
            annotations.push(`    @Max(message = "${field.name} 不得超過 ${maxValue}", value = ${maxValue})`);
        } else {
            annotations.push(`    @Size(message = "${field.name} 長度不得超過 ${cfg.maxLength}", max = ${cfg.maxLength})`);
        }
    }

    const camelCaseName = toCamelCase(field.name);
    annotations.push(`    private ${cfg.type} ${camelCaseName};\n`);

    return annotations.join('\n');
}

// --- Copy Button ---
copyBtn.addEventListener('click', copyToClipboard);

// --- Spec Text Tab Elements ---
const specElements = {
    tabJson: document.getElementById('tabJson'),
    tabSpec: document.getElementById('tabSpec'),
    jsonPanel: document.getElementById('jsonPanel'),
    specPanel: document.getElementById('specPanel'),
    specTextArea: document.getElementById('specTextArea'),
    parseSpecBtn: document.getElementById('parseSpecBtn')
};

// --- Tab Switching ---
const switchTab = (activeTab) => {
    const tabs = [specElements.tabJson, specElements.tabSpec];
    const panels = [specElements.jsonPanel, specElements.specPanel];

    tabs.forEach((tab, i) => {
        const isActive = tab === activeTab;
        tab.classList.toggle('border-primary-500', isActive);
        tab.classList.toggle('text-primary-700', isActive);
        tab.classList.toggle('border-transparent', !isActive);
        tab.classList.toggle('text-gray-500', !isActive);
        panels[i].classList.toggle('hidden', !isActive);
    });
};

specElements.tabJson.addEventListener('click', () => switchTab(specElements.tabJson));
specElements.tabSpec.addEventListener('click', () => switchTab(specElements.tabSpec));

// --- Spec Text Parsing ---

/**
 * Normalize type strings from spec text (e.g. 'integer' -> 'Integer').
 */
const normalizeType = (rawType) => {
    const typeMap = {
        'string': 'String', 'integer': 'Integer', 'int': 'Integer',
        'long': 'Long', 'double': 'Double', 'float': 'Float',
        'boolean': 'Boolean', 'bigdecimal': 'BigDecimal',
        'localdate': 'LocalDate', 'localdatetime': 'LocalDateTime',
        'timestamp': 'Timestamp'
    };
    return typeMap[rawType.toLowerCase()] || rawType;
};

/**
 * Compute which classes need @Valid (i.e. have validation annotations).
 */
const computeSpecValidation = (specClassesMap) => {
    const cache = {};
    const check = (className) => {
        if (cache[className] !== undefined) return cache[className];
        cache[className] = false;
        const fields = specClassesMap[className];
        if (!fields) return false;
        cache[className] = fields.some(f => {
            if (f.required || f.length) return true;
            if (f.nestedClass) return check(f.nestedClass);
            return false;
        });
        return cache[className];
    };
    Object.keys(specClassesMap).forEach(check);
    return cache;
};

/**
 * Generate a single Java DTO class from spec fields.
 */
const generateSpecClass = (className, fields, specClassesMap, validationMap) => {
    const validationPackage = getValidationPackage();
    const imports = new Set([
        'import lombok.Data;',
        'import java.io.Serial;',
        'import java.io.Serializable;',
        'import com.fasterxml.jackson.annotation.JsonProperty;'
    ]);

    fields.forEach(field => {
        if (field.required) {
            const aType = field.type === 'String' ? 'NotBlank'
                : field.isList ? 'NotEmpty' : 'NotNull';
            imports.add(`import ${validationPackage}.${aType};`);
        }

        if (field.length) {
            imports.add(`import ${validationPackage}.${isNumericType(field.type) ? 'Max' : 'Size'};`);
        }

        if (field.nestedClass && validationMap[field.nestedClass]) {
            imports.add(javaVersionSelect.value === 'jakarta' ? 'import jakarta.validation.Valid;' : 'import javax.validation.Valid;');
        }

        if (field.isList) imports.add('import java.util.List;');
        if (TYPE_IMPORTS[field.type]) imports.add(TYPE_IMPORTS[field.type]);
    });

    let code = `${Array.from(imports).sort().join('\n')}\n\n@Data\n`;
    code += `public class ${className} implements Serializable {\n\n`;
    code += '    /** serialVersionUID */\n';
    code += '    private static final long serialVersionUID = 1L;\n\n';

    code += fields.map(field => {
        const annotations = [];
        const displayType = field.isList
            ? `List<${field.nestedClass || field.type}>`
            : field.type;

        annotations.push(`    /** ${field.comment} */`);
        annotations.push(`    @JsonProperty("${field.originalName}")`);

        if (field.nestedClass && validationMap[field.nestedClass]) {
            annotations.push(`    @Valid`);
        }

        if (field.required) {
            const message = `${field.originalName} 不得為空`;
            const aType = field.type === 'String' ? 'NotBlank'
                : field.isList ? 'NotEmpty' : 'NotNull';
            annotations.push(`    @${aType}(message="${message}")`);
        }

        if (field.length) {
            if (isNumericType(field.type)) {
                const maxValue = Math.pow(10, parseInt(field.length)) - 1;
                annotations.push(`    @Max(message = "${field.originalName} 不得超過 ${maxValue}", value = ${maxValue})`);
            } else {
                annotations.push(`    @Size(message = "${field.originalName} 長度不得超過 ${field.length}", max = ${field.length})`);
            }
        }

        annotations.push(`    private ${displayType} ${field.camelName};\n`);
        return annotations.join('\n');
    }).join('\n');

    code += '}';
    return code;
};

/**
 * Handle the Parse & Generate button click.
 * Supports multi-level hierarchy and TRANRQ/TRANRS detection.
 */
const handleParseSpec = (e) => {
    if (!validateProgramName()) {
        e.preventDefault();
        return;
    }

    const specText = specElements.specTextArea.value;
    if (!specText.trim()) {
        alert('Please paste spec text first.');
        return;
    }

    const programName = programNameInput.value.trim();
    const rawLines = specText.split('\n');

    // --- Pre-process: merge continuation lines ---
    // When pasting from Word/Excel, a cell value like "FiberOpticList[i].\nFiberOpticPack"
    // may be split across two lines. Detect this and merge them back together.
    const lines = [];
    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (!line.trim()) continue;

        const firstCell = line.split('\t')[0]?.trim();
        if (!isNaN(parseInt(firstCell)) && parseInt(firstCell) >= 1) {
            // Line starts with a valid level number – it's a normal line
            lines.push(line);
        } else if (lines.length > 0) {
            // No valid level number – treat as continuation of previous line
            // Concatenate directly so the split field name is rejoined
            lines[lines.length - 1] += line;
        }
    }

    // --- Pass 1: Parse lines into hierarchical class map ---
    let direction = null;
    let specRootClassName = null;
    const specClassesMap = {};
    const levelToClass = {};

    for (const line of lines) {
        const cells = line.split('\t');
        const levelStr = cells[0]?.trim();
        const level = parseInt(levelStr);

        if (isNaN(level) || level < 1) continue;

        let rawName = cells[1]?.trim();
        if (!rawName) continue;

        // Strip "ListName[i]." or "ListName[n]." prefix from field names
        // e.g. "FiberOpticList[i].FiberOpticPack" → "FiberOpticPack"
        rawName = rawName.replace(/^\w+\[\w+\]\./, '');

        if (level === 1) {
            const upper = rawName.toUpperCase();
            if (upper === 'TRANRQ') direction = 'Tranrq';
            else if (upper === 'TRANRS') direction = 'Tranrs';
            else direction = capitalize(rawName);

            specRootClassName = programName + direction;
            specClassesMap[specRootClassName] = [];
            levelToClass[level + 1] = specRootClassName;
            continue;
        }

        const parentClass = levelToClass[level];
        if (!parentClass) continue;

        const rawType = cells[2]?.trim() || 'String';
        const lengthRaw = cells[3]?.trim() || '';
        const length = (lengthRaw && lengthRaw !== '-') ? lengthRaw : '';
        const requiredRaw = cells[4]?.trim() || '';
        const isRequired = requiredRaw.toUpperCase() === 'Y';
        const description = cells[5]?.trim() || rawName;

        if (rawType === 'List<Object>' || rawType === 'List') {
            const suffix = rawName.endsWith('List')
                ? capitalize(rawName.slice(0, -4))
                : capitalize(rawName);
            const nestedClassName = parentClass + suffix;

            specClassesMap[nestedClassName] = [];
            levelToClass[level + 1] = nestedClassName;

            specClassesMap[parentClass].push({
                originalName: rawName,
                camelName: toCamelCase(rawName),
                type: 'List',
                isList: true,
                nestedClass: nestedClassName,
                length: '',
                required: isRequired,
                comment: description
            });
            continue;
        }

        // Handle List<primitive> types, e.g. List<string> -> List<String>
        const listPrimitiveMatch = rawType.match(/^List<(\w+)>$/i);
        if (listPrimitiveMatch && listPrimitiveMatch[1].toLowerCase() !== 'object') {
            const innerType = normalizeType(listPrimitiveMatch[1]);
            specClassesMap[parentClass].push({
                originalName: rawName,
                camelName: toCamelCase(rawName),
                type: innerType,
                isList: true,
                nestedClass: null,
                length: '',
                required: isRequired,
                comment: description
            });
            continue;
        }

        const type = normalizeType(rawType);

        specClassesMap[parentClass].push({
            originalName: rawName,
            camelName: toCamelCase(rawName),
            type,
            isList: false,
            nestedClass: null,
            length,
            required: isRequired,
            comment: description
        });
    }

    if (!specRootClassName || Object.keys(specClassesMap).length === 0) {
        alert('No valid fields found. Make sure line 1 contains TRANRQ or TRANRS.');
        return;
    }

    const totalFields = Object.values(specClassesMap).reduce((sum, f) => sum + f.length, 0);
    if (totalFields === 0) {
        alert('No valid fields found. Please check the input format.');
        return;
    }

    // --- Pass 2: Generate Java classes ---
    const validationMap = computeSpecValidation(specClassesMap);

    const javaCode = Object.entries(specClassesMap)
        .map(([cn, fields]) => generateSpecClass(cn, fields, specClassesMap, validationMap))
        .join('\n\n');

    outputEditor.setValue(javaCode, -1);
    structurePanel.classList.add('hidden');
};

specElements.parseSpecBtn.addEventListener('click', handleParseSpec);