// script.js - Refactored with ES6+

// --- Constants & Configuration ---
const VALIDATION_PACKAGES = {
    jakarta: 'jakarta.validation.constraints',
    javax: 'javax.validation.constraints'
};

const STANDARD_TYPES = new Set([
    'String', 'Integer', 'Long', 'Double', 'Boolean',
    'BigDecimal', 'LocalDate', 'LocalDateTime', 'Timestamp'
]);

const NUMERIC_TYPES = new Set([
    'Integer', 'Long', 'Short', 'BigInteger',
    'Double', 'Float', 'BigDecimal'
]);

const TYPE_IMPORTS = {
    BigDecimal: 'import java.math.BigDecimal;',
    LocalDate: 'import java.time.LocalDate;',
    LocalDateTime: 'import java.time.LocalDateTime;',
    Timestamp: 'import java.sql.Timestamp;'
};

const SAMPLE_JSON = {
    TRANRQ: {
        caseList: [{
            caseId: "20240619",
            caseType: "INQUIRY",
            flows: {
                basicInfo: {
                    firstName: "Yong Sun",
                    lastName: "Kim",
                    age: 34
                }
            }
        }]
    }
};

// --- Editor Initialization ---
const initEditor = (id, mode, readOnly = false) => {
    const editor = ace.edit(id);
    editor.setTheme("ace/theme/monokai");
    editor.session.setMode(`ace/mode/${mode}`);
    editor.setOptions({
        fontSize: "12pt",
        showPrintMargin: false,
        ...(readOnly && { readOnly: true })
    });
    return editor;
};

const jsonEditor = initEditor("jsonEditor", "json");
const outputEditor = initEditor("outputEditor", "java", true);

jsonEditor.setValue(JSON.stringify(SAMPLE_JSON, null, 2), -1);

// --- State Management ---
const state = {
    jsonStructure: null,
    fieldConfigurations: {},
    currentField: null,
    isRequest: false,
    rootClassName: "",
    classesMap: {},
    classValidationMap: {}
};

// --- DOM Elements ---
const elements = {
    programName: document.getElementById('programName'),
    programNameError: document.getElementById('programNameError'),
    generateBtn: document.getElementById('generateBtn'),
    copyBtn: document.getElementById('copyBtn'),
    beautifyBtn: document.getElementById('beautifyBtn'),
    javaVersion: document.getElementById('javaVersion'),
    structurePanel: document.getElementById('structurePanel'),
    structureContainer: document.getElementById('structureContainer'),
    fieldModal: document.getElementById('fieldModal'),
    closeModal: document.getElementById('closeModal'),
    saveFieldConfig: document.getElementById('saveFieldConfig'),
    fieldType: document.getElementById('fieldType'),
    customTypeContainer: document.getElementById('customTypeContainer'),
    customType: document.getElementById('customType'),
    modalContainer: document.querySelector('.modal-container')
};

// --- Utility Functions ---
const capitalize = str => str.charAt(0).toUpperCase() + str.slice(1);

const isStandardType = type => STANDARD_TYPES.has(type);

const isNumericType = type => NUMERIC_TYPES.has(type);

const getBaseType = type => type.startsWith('List<') ? type.slice(5, -1) : type;

const toCamelCase = str =>
    str.replace(/^[A-Z]/, m => m.toLowerCase())
        .replace(/_([a-zA-Z])/g, (_, c) => c.toUpperCase());

const validateProgramName = () => {
    const isValid = elements.programName.value.trim() !== '';
    elements.programNameError.classList.toggle('hidden', isValid);
    return isValid;
};

// --- Validation Logic ---
const classHasValidation = (className, classes, fieldConfigs) => {
    const fields = classes[className];
    if (!fields) return false;

    return fields.some(field => {
        const path = `${className}.${field.name}`;
        const cfg = fieldConfigs[path];

        // Check if field has validation annotations
        if (cfg?.required || cfg?.maxLength) return true;

        // Check nested objects recursively
        const baseType = getBaseType(cfg?.type);
        return !isStandardType(baseType) && classes[baseType]
            ? classHasValidation(baseType, classes, fieldConfigs)
            : false;
    });
};

const computeValidationNeeds = classes =>
    Object.keys(classes).reduce((map, className) => ({
        ...map,
        [className]: classHasValidation(className, classes, state.fieldConfigurations)
    }), {});

// --- Class Extraction ---
const extractClasses = (obj, rootName) => {
    const classes = {};

    const processObject = (obj, className, parentPath = '') => {
        classes[className] ??= [];

        Object.entries(obj).forEach(([key, value]) => {
            const fieldPath = parentPath ? `${parentPath}.${key}` : key;

            if (Array.isArray(value)) {
                if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
                    const itemClassName = className + capitalize(
                        key.endsWith('List') ? key.slice(0, -4) : key
                    );
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
                const type = typeof value === 'number'
                    ? (Number.isInteger(value) ? 'Integer' : 'Double')
                    : typeof value === 'boolean' ? 'Boolean' : 'String';
                classes[className].push({ name: key, type, isList: false });
            }
        });
    };

    processObject(obj, rootName);
    return classes;
};

// --- UI Functions ---
const displayStructure = (obj, path) => {
    elements.structureContainer.innerHTML = '';
    const classes = extractClasses(obj, path);

    Object.entries(classes).forEach(([className, fields]) => {
        const classDiv = createElement('div', 'p-4 border border-gray-200 rounded-md', [
            createElement('h3', 'text-lg font-semibold text-primary-700 mb-2', className),
            createFieldsList(className, fields)
        ]);
        elements.structureContainer.appendChild(classDiv);
    });
};

const createElement = (tag, className, children) => {
    const el = document.createElement(tag);
    el.className = className;
    if (typeof children === 'string') {
        el.textContent = children;
    } else if (Array.isArray(children)) {
        children.forEach(child => el.appendChild(child));
    }
    return el;
};

const createFieldsList = (className, fields) => {
    const fieldsList = createElement('div', 'space-y-2', []);

    fields.forEach(field => {
        const fieldPath = `${className}.${field.name}`;
        state.fieldConfigurations[fieldPath] ??= {
            name: field.name,
            type: field.isList ? `List<${field.type}>` : field.type,
            required: false,
            maxLength: '',
            jsonAlias: '',
            comment: '',
            customType: ''
        };

        const cfg = state.fieldConfigurations[fieldPath];
        const fieldDiv = createElement('div', 'flex items-center justify-between p-2 bg-gray-50 rounded', []);

        const fieldInfo = createElement('div', '', []);
        fieldInfo.innerHTML = `<span class="font-medium">${field.name}</span>: <span class="text-green-600">${cfg.type}</span>`;

        const configBtn = createElement('button', 'px-2 py-1 bg-primary-100 text-primary-700 rounded hover:bg-primary-200 text-sm', 'Configure');
        configBtn.onclick = () => openFieldModal(fieldPath);

        fieldDiv.append(fieldInfo, configBtn);
        fieldsList.appendChild(fieldDiv);
    });

    return fieldsList;
};

const toggleModal = (show) => {
    elements.fieldModal.classList.toggle('opacity-0', !show);
    elements.fieldModal.classList.toggle('pointer-events-none', !show);
    elements.fieldModal.classList.toggle('opacity-100', show);
    elements.modalContainer.classList.toggle('scale-95', !show);
    elements.modalContainer.classList.toggle('scale-100', show);
};

const openFieldModal = (fieldPath) => {
    state.currentField = fieldPath;
    const config = state.fieldConfigurations[fieldPath];
    const baseType = getBaseType(config.type);

    document.getElementById('fieldName').value = config.name;

    if (isStandardType(baseType)) {
        elements.fieldType.value = baseType;
        elements.customTypeContainer.classList.add('hidden');
    } else {
        elements.fieldType.value = 'Others';
        elements.customType.value = config.customType || baseType;
        elements.customTypeContainer.classList.remove('hidden');
    }

    document.getElementById('fieldRequired').checked = config.required;
    document.getElementById('fieldMaxLength').value = config.maxLength;
    document.getElementById('fieldJsonAlias').value = config.jsonAlias;
    document.getElementById('fieldComment').value = config.comment;

    toggleModal(true);
};

const closeFieldModal = () => toggleModal(false);

const saveFieldConfiguration = () => {
    if (!state.currentField) return;

    const config = state.fieldConfigurations[state.currentField];
    const selectedType = elements.fieldType.value;

    if (selectedType === 'Others') {
        const customType = elements.customType.value.trim();
        if (!customType) return alert("Custom type cannot be empty");

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

    displayStructure(state.jsonStructure, state.rootClassName);
    closeFieldModal();
    regenerateDTO();
};

const regenerateDTO = () => {
    if (!state.jsonStructure || !state.rootClassName) return;

    state.classesMap = extractClasses(state.jsonStructure, state.rootClassName);
    state.classValidationMap = computeValidationNeeds(state.classesMap);

    const javaCode = Object.keys(state.classesMap)
        .map(className => generateClass(className, state.classesMap[className]))
        .join('\n\n');

    outputEditor.setValue(javaCode, -1);
};

// --- Code Generation ---
const generateClass = (className, fields) => {
    const validationPackage = VALIDATION_PACKAGES[elements.javaVersion.value];
    const imports = collectImports(className, fields, validationPackage);

    let code = `${Array.from(imports).sort().join('\n')}\n\n@Data\n`;
    code += `public class ${className} implements Serializable {\n\n`;
    code += '    /** serialVersionUID */\n';
    code += '    private static final long serialVersionUID = 1L;\n\n';
    code += fields.map(field => generateField(className, field, validationPackage)).join('\n');
    code += '}';

    return code;
};

const collectImports = (className, fields, validationPackage) => {
    const imports = new Set([
        'import lombok.Data;',
        'import java.io.Serial;',
        'import java.io.Serializable;',
        'import com.fasterxml.jackson.annotation.JsonProperty;'
    ]);

    fields.forEach(field => {
        const path = `${className}.${field.name}`;
        const cfg = state.fieldConfigurations[path];

        if (cfg.jsonAlias) imports.add('import com.fasterxml.jackson.annotation.JsonAlias;');

        if (cfg.required) {
            const annotationType = cfg.type === 'String' ? 'NotBlank'
                : cfg.type.startsWith('List<') ? 'NotEmpty' : 'NotNull';
            imports.add(`import ${validationPackage}.${annotationType};`);
        }

        if (cfg.maxLength) {
            imports.add(`import ${validationPackage}.${isNumericType(cfg.type) ? 'Max' : 'Size'};`);
        }

        const baseType = getBaseType(cfg.type);
        if (!isStandardType(baseType) && state.classesMap[baseType] && state.classValidationMap[baseType]) {
            imports.add(`import ${validationPackage}.Valid;`);
        }

        if (TYPE_IMPORTS[cfg.type]) imports.add(TYPE_IMPORTS[cfg.type]);
        if (cfg.type.startsWith('List<')) imports.add('import java.util.List;');
    });

    return imports;
};

const generateField = (className, field, validationPackage) => {
    const path = `${className}.${field.name}`;
    const cfg = state.fieldConfigurations[path];
    const annotations = [];

    if (cfg.comment) annotations.push(`    /** ${cfg.comment} */`);

    annotations.push(`    @JsonProperty("${field.name}")`);

    if (cfg.jsonAlias) {
        const aliases = cfg.jsonAlias.split(',').map(a => `"${a.trim()}"`).join(', ');
        annotations.push(`    @JsonAlias(${aliases})`);
    }

    const baseType = getBaseType(cfg.type);
    if (!isStandardType(baseType) && state.classesMap[baseType] && state.classValidationMap[baseType]) {
        annotations.push(`    @Valid`);
    }

    if (cfg.required) {
        const message = `${field.name} 不得為空`;
        const annotationType = cfg.type === 'String' ? 'NotBlank'
            : cfg.type.startsWith('List<') ? 'NotEmpty' : 'NotNull';
        annotations.push(`    @${annotationType}(message="${message}")`);
    }

    if (cfg.maxLength) {
        if (isNumericType(cfg.type)) {
            const maxValue = Math.pow(10, parseInt(cfg.maxLength)) - 1;
            annotations.push(`    @Max(message = "${field.name} 不得超過 ${maxValue}", value = ${maxValue})`);
        } else {
            annotations.push(`    @Size(message = "${field.name} 長度不得超過 ${cfg.maxLength}", max = ${cfg.maxLength})`);
        }
    }

    const camelCaseName = toCamelCase(field.name);
    annotations.push(`    private ${cfg.type} ${camelCaseName};\n`);

    return annotations.join('\n');
};

// --- Event Handlers ---
const handleGenerate = (e) => {
    if (!validateProgramName()) {
        e.preventDefault();
        return;
    }

    try {
        const jsonObj = JSON.parse(jsonEditor.getValue());

        if (jsonObj.TRANRQ) {
            state.jsonStructure = jsonObj.TRANRQ;
            state.isRequest = true;
        } else if (jsonObj.TRANRS) {
            state.jsonStructure = jsonObj.TRANRS;
            state.isRequest = false;
        } else {
            throw new Error("JSON must contain either TRANRQ or TRANRS as the root object");
        }

        const programName = elements.programName.value.trim();
        if (!programName) throw new Error("Program name is required");

        state.rootClassName = programName + (state.isRequest ? "Tranrq" : "Tranrs");
        state.fieldConfigurations = {};

        displayStructure(state.jsonStructure, state.rootClassName);
        elements.structurePanel.classList.remove('hidden');
        regenerateDTO();
    } catch (error) {
        alert(`Error generating DTO classes: ${error.message}`);
    }
};

const handleBeautify = () => {
    try {
        const obj = JSON.parse(jsonEditor.getValue());
        jsonEditor.setValue(JSON.stringify(obj, null, 2), -1);
    } catch (error) {
        alert(`Invalid JSON: ${error.message}`);
    }
};

const handleCopy = async () => {
    const code = outputEditor.getValue();
    if (!code) return alert("No code to copy");

    try {
        await navigator.clipboard.writeText(code);
        const originalText = elements.copyBtn.textContent;
        elements.copyBtn.textContent = "Copied!";
        elements.copyBtn.classList.replace('bg-amber-500', 'bg-green-600');
        elements.copyBtn.classList.replace('hover:bg-amber-600', 'hover:bg-green-700');

        setTimeout(() => {
            elements.copyBtn.textContent = originalText;
            elements.copyBtn.classList.replace('bg-green-600', 'bg-amber-500');
            elements.copyBtn.classList.replace('hover:bg-green-700', 'hover:bg-amber-600');
        }, 2000);
    } catch (err) {
        alert(`Failed to copy: ${err}`);
    }
};

const handleFieldTypeChange = () => {
    elements.customTypeContainer.classList.toggle(
        'hidden',
        elements.fieldType.value !== 'Others'
    );
};

// --- Event Listeners ---
elements.generateBtn.addEventListener('click', handleGenerate);
elements.beautifyBtn.addEventListener('click', handleBeautify);
elements.copyBtn.addEventListener('click', handleCopy);
elements.closeModal.addEventListener('click', closeFieldModal);
elements.saveFieldConfig.addEventListener('click', saveFieldConfiguration);
elements.fieldType.addEventListener('change', handleFieldTypeChange);