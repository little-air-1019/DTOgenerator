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

        const classes = extractClasses(jsonStructure, rootClassName);
        let javaCode = '';
        for (const className in classes) {
            javaCode += generateClass(className, classes[className]) + '\n\n';
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
        const classes = extractClasses(jsonStructure, rootClassName);
        let javaCode = '';
        for (const className in classes) {
            javaCode += generateClass(className, classes[className]) + '\n\n';
        }
        outputEditor.setValue(javaCode, -1);
    }
}

function generateClass(className, fields) {
    const validationPackage = javaVersionSelect.value === '17'
        ? 'jakarta.validation.constraints'
        : 'javax.validation.constraints';
    const imports = new Set([
        'import lombok.Data;',
        'import java.io.Serial;',
        'import java.io.Serializable;',
        'import com.fasterxml.jackson.annotation.JsonProperty;'
    ]);

    for (const field of fields) {
        const path = `${className}.${field.name}`;
        const cfg = fieldConfigurations[path];

        if (cfg.jsonAlias) imports.add('import com.fasterxml.jackson.annotation.JsonAlias;');
        if (cfg.required) {
            if (cfg.type === 'String') imports.add(`import ${validationPackage}.NotBlank;`);
            else imports.add(`import ${validationPackage}.NotNull;`);
        }
        if (cfg.maxLength) {
            if (['Integer', 'Long', 'Double', 'BigDecimal'].includes(cfg.type)) {
                imports.add(`import ${validationPackage}.Max;`);
            } else {
                imports.add(`import ${validationPackage}.Size;`);
            }
        }
        if (cfg.type === 'BigDecimal') imports.add('import java.math.BigDecimal;');
        if (cfg.type === 'LocalDate') imports.add('import java.time.LocalDate;');
        if (cfg.type === 'LocalDateTime') imports.add('import java.time.LocalDateTime;');
        if (cfg.type === 'Timestamp') imports.add('import java.sql.Timestamp;');
        if (cfg.type.startsWith('List<')) imports.add('import java.util.List;');
    }

    let code = Array.from(imports).sort().join('\n') + '\n\n@Data\n';
    code += `public class ${className} implements Serializable {\n\n`;
    code += '    /** serialVersionUID */\n';
    code += '    private static final long serialVersionUID = 1L;\n\n';

    for (const field of fields) {
        const path = `${className}.${field.name}`;
        const cfg = fieldConfigurations[path];

        if (cfg.comment) code += `    /** ${cfg.comment} */\n`;
        code += `    @JsonProperty(\"${field.name}\")\n`;
        if (cfg.jsonAlias) {
            const aliases = cfg.jsonAlias.split(',').map(a => `\"${a.trim()}\"`).join(', ');
            code += `    @JsonAlias(${aliases})\n`;
        }
        if (cfg.required) {
            code += cfg.type === 'String'
                ? `    @NotBlank(message=\"${field.name} 不得為空\")\n`
                : `    @NotNull(message=\"${field.name} 不得為空\")\n`;
        }
        if (cfg.maxLength) {
            if (['Integer', 'Long', 'Double', 'BigDecimal'].includes(cfg.type)) {
                // Convert length to max value: length 4 -> max value 9999
                const maxValue = Math.pow(10, parseInt(cfg.maxLength)) - 1;
                code += `    @Max(message = \"${field.name} 不得超過 ${maxValue}\", value = ${maxValue})\n`;
            } else {
                code += `    @Size(message = \"${field.name} 長度不得超過 ${cfg.maxLength}\", max = ${cfg.maxLength})\n`;
            }
        }
        // Convert field.name to lower camel case
        const camelCaseName = field.name.replace(/^[A-Z]/, m => m.toLowerCase()).replace(/_([a-zA-Z])/g, (_, c) => c.toUpperCase());
        code += `    private ${cfg.type} ${camelCaseName};\n\n`;
    }
    code += '}';
    return code;
}

copyBtn.addEventListener('click', copyToClipboard);
