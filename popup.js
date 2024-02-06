function parseQueryString(data) { 
    const params = new URLSearchParams(data); 
    const formData = {};

    for (const [key, value] of params.entries()) {
        formData[key] = value;
    }
    return formData;
}

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('clearButton').addEventListener('click', clearHeaders);
    document.getElementById('startButton').addEventListener('click', startCapturing);
    document.getElementById('stopButton').addEventListener('click', stopCapturing);

    const headersContainer = document.getElementById('headerContainer');

    let capturing = true;

    document.addEventListener('submit', function (event) {
        if (capturing) {
            event.preventDefault(); 
            const target = event.target;
            if (target.tagName === 'FORM') {
                const formData = new FormData(target);
                displayHeaders('Request', [], formatFormData(formData), target.action, Date.now(), null, null);
            } else {
                const formData = new FormData();
                formData.append('non-form-data', target.value);
                displayHeaders('Request', [], formatFormData(formData), target.form.action, Date.now(), null, null);
            }
        }
    });

    document.addEventListener('click', function (event) {
        if (capturing) {
            const target = event.target;
            if ((target.tagName === 'BUTTON' || (target.tagName === 'INPUT' && target.type === 'submit')) && target.form) {
                event.preventDefault(); 
                const formData = new FormData(target.form);
                displayHeaders('Request', [], formatFormData(formData), target.form.action, Date.now(), null, null);
            }
        }
    });

    const browser = window.browser || window.chrome;

    browser.webRequest.onBeforeRequest.addListener(
        captureRequest,
        { urls: ['<all_urls>'] },
        ['blocking', 'requestBody']
    );

    browser.webRequest.onBeforeSendHeaders.addListener(
        captureRequestHeaders,
        { urls: ['<all_urls>'] },
        ['blocking', 'requestHeaders']
    );

    browser.webRequest.onHeadersReceived.addListener(
        captureResponseHeaders,
        { urls: ['<all_urls>'] },
        ['blocking', 'responseHeaders']
    );

    browser.webRequest.onBeforeRequest.addListener(
        capturePostData,
        { urls: ['<all_urls>'] },
        ['blocking', 'requestBody']
    );

    browser.webRequest.onBeforeRequest.addListener(
        captureFormDataForSidebar,
        { urls: ['<all_urls>'] },
        ['blocking', 'requestBody']
    );

    function captureFormDataForSidebar(details) {
        if (capturing && details.method === 'POST') {
            try {
                if (details.requestBody && details.requestBody.formData) {
                    const formData = new FormData();
                    for (const [key, value] of Object.entries(details.requestBody.formData)) {
                        formData.append(key, value);
                    }
                    console.log('Raw Form Data for sidebar:', formData);
                    const formDataObject = {};
                    formData.forEach((value, key) => {
                        formDataObject[key] = Array.isArray(value) ? value.join(', ') : value;
                    });
                    console.log('Converted Form Data for sidebar:', formDataObject);
                }
            } catch (error) {
                console.error('Error capturing POST data for sidebar:', error);
            }
        }
        return details;
    }

    function captureRequest(details) {
        if (capturing && details.method === 'POST') {
            try {
                const postData = readRequestBody(details.requestBody);
                console.log('POST data captured:', postData);

                if (details.requestBody instanceof FormData) {
                    const requestHeaders = Array.isArray(details.requestHeaders) ? details.requestHeaders : [{ name: 'Content-Type', value: 'application/x-www-form-urlencoded' }];
                    displayHeaders('Request', requestHeaders, formatFormData(postData), details.url, details.requestId);
                }
            } catch (error) {
                console.error('Error capturing POST data:', error);
            }
        }
        return details;
    }

    function capturePostData(details) {
        if (capturing && details.method === 'POST') {
            try {
                if (details.requestBody && details.requestBody.formData) {
                    const formData = new FormData();
                    for (const [key, value] of Object.entries(details.requestBody.formData)) {
                        formData.append(key, value);
                    }
                    const formDataObject = {};
                    formData.forEach((value, key) => {
                        formDataObject[key] = Array.isArray(value) ? value.join(', ') : value;
                    });
                    displayHeaders('Request', details.requestHeaders || [], formatFormDataObject(formDataObject), details.url, details.requestId, null, null, false, formData);
                }
            } catch (error) {
                console.error('Error capturing POST data:', error);
            }
        }
    }

    function captureRequestHeaders(details) {
        if (capturing) {
            console.log(`Request headers captured for ${details.method} request to ${details.url}:`, details.requestHeaders);

            if (details.method === 'POST' && details.requestBody && details.requestBody.formData) {
                const formData = formatFormData(details.requestBody.formData);
                displayHeaders('Request', details.requestHeaders, formData, details.url, details.requestId);
            } else if (details.method === 'GET') {
                displayHeaders('Request', details.requestHeaders, null, details.url, details.requestId);
            } else {
                console.log('Unhandled request type or no POST data available.');
                displayHeaders('Request', details.requestHeaders, null, details.url, details.requestId);
            }

            return { requestHeaders: details.requestHeaders, requestId: details.requestId };
        }
    }

    function captureResponseHeaders(details) {
        if (capturing) {
            console.log('Response headers captured:', details.responseHeaders);

            const statusCodeHeader = details.responseHeaders.find(header => header.name.toLowerCase() === 'status');
            const statusCode = statusCodeHeader ? statusCodeHeader.value : getStatusFromHeaders(details.responseHeaders);

            const formData = details.responseHeaders.find(header => header.name.toLowerCase() === 'content-type' && header.value.includes('application/x-www-form-urlencoded'))
                ? parseQueryString(details.responseHeaders.find(header => header.name.toLowerCase() === 'set-cookie').value)
                : null;

            displayHeaders('Response', details.responseHeaders, null, null, details.requestId, statusCode, formData);
            return { responseHeaders: details.responseHeaders, requestId: details.requestId };
        }
    }

    async function readRequestBody(requestBody) {
        if (requestBody && requestBody.raw && requestBody.raw.length > 0) {
            const decoder = new TextDecoder('utf-8');
            const data = await new Response(requestBody.raw[0].bytes).text();
            return parseQueryString(data);
        } else {
            return '';
        }
    }

    function getStatusFromHeaders(responseHeaders) {
        const statusLine = responseHeaders.find(header => header.name.toLowerCase() === 'status');
        if (statusLine) {
            const match = statusLine.value.match(/\d+/);
            return match ? match[0] : 'N/A';
        } else {
            return 'N/A';
        }
    }

    function formatFormDataObject(formData) {
        const formDataLines = Object.entries(formData)
            .map(([key, value]) => `<span class="data-line"><strong>${key}:</strong> ${formatFormDataValue(value)}</span>`)
            .join('\n');

        return formDataLines;
    }

    function formatFormDataValue(value) {
        if (typeof value === 'object') {
            return JSON.stringify(value);
        } else {
            return value;
        }
    }

    function displayFormData(formData) {
        const formDataObject = {};
        for (const [key, value] of formData.entries()) {
            formDataObject[key] = Array.isArray(value) ? value.join(', ') : value;
        }

        console.log('Captured Form Data:', formDataObject);
    }

    function formatFormData(formDataText) {
        return `<span class="data-line"><strong></strong> ${formDataText}</span>`;
    }

    function createHeaderSection(type, requestId, headerText, data, url, statusCode, formDataText, isFormDataBlock = false, requestBodyContent = '') {
        const section = document.createElement('div');
        const className = `${type.toLowerCase()}-section`.replace(/\s+/g, '');
        section.classList.add(className);
        section.dataset.requestId = requestId;
        const headerContent = `<strong>${type} Headers (${statusCode}):</strong>\n${headerText}`;
        if (data) {
            section.innerHTML = `${headerContent}\n\n<strong></strong>\n${data}`;
        } else {
            section.innerHTML = headerContent;
        }
        if (isFormDataBlock && formDataText) {
            section.innerHTML += `\n\n${formDataText}`;
        }
        section.requestURL = url;
        if (requestBodyContent) {
            const requestBodyContainer = createRequestBodyContainer(requestBodyContent);
            section.appendChild(requestBodyContainer);
        }
        return section;
    }

    function createRequestBodyContainer(content) {
        const container = document.createElement('div');
        container.classList.add('request-body-container');

        const label = document.createElement('strong');
        label.textContent = 'Request Body:';

        const requestBodyContent = document.createElement('pre');
        requestBodyContent.textContent = content;

        const selectButton = document.createElement('button');
        selectButton.textContent = 'Select';
        selectButton.classList.add('control-button');
        selectButton.addEventListener('click', () => makeEditable(container));

        container.appendChild(label);
        container.appendChild(requestBodyContent);
        container.appendChild(selectButton);

        return container;
    }

    function replayRequest(section) {
        const selectedRequest = section;
        const editedContent = selectedRequest.querySelector('textarea').value;

        const editedHeaders = editedContent.split('\n');
        const method = editedHeaders[0].includes('Request') ? 'POST' : 'GET';

        const requestOptions = {
            method: method,
            headers: parseHeaders(editedHeaders.slice(1).join('\n')),
        };

        if (method === 'POST') {
            requestOptions.body = selectedRequest.querySelector('textarea').value;
        }

        if (requestOptions.headers['content-type'] && requestOptions.headers['content-type'].includes('application/json')) {
            requestOptions.body = JSON.parse(requestOptions.body);
        }

        fetch(selectedRequest.requestURL, requestOptions)
            .then(response => {
                const statusCode = response.status;
                const responseHeaders = [];
                response.headers.forEach((value, name) => {
                    responseHeaders.push({ name, value });
                });

                displayHeaders('Replayed Response', responseHeaders, null, selectedRequest.requestURL, selectedRequest.dataset.requestId, statusCode);
            })
            .catch(error => {
                console.error('Error replaying request:', error);
            });
    }

    function makeEditable(section) {
        const headerText = section.innerText.trim();
        const textarea = document.createElement('textarea');
        textarea.value = headerText;
        textarea.classList.add('editable-textarea');
        section.innerHTML = '';
        section.appendChild(textarea);

        const replayButton = createButton('Replay', () => replayRequest(section));
        section.appendChild(replayButton);
    }

    function parseHeaders(headerText) {
        const headers = {};
        const headerLines = headerText.split('\n');

        for (const line of headerLines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex !== -1) {
                const key = line.substring(0, colonIndex).trim();
                const value = line.substring(colonIndex + 1).trim();
                headers[key] = value;
            }
        }

        return headers;
    }

    function createButton(text, onClick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.addEventListener('click', onClick);
        button.classList.add('control-button');
        return button;
    }

    function clearHeaders() {
        headersContainer.innerHTML = '';
    }

    function startCapturing() {
        capturing = true;
        console.log('Capturing started.');
    }

    function stopCapturing() {
        capturing = false;
        console.log('Capturing stopped.');
    }

    function displayHeaders(type, headers, data, url, requestId, statusCode, formDataHTML, isFormDataBlock = false, requestBodyContent = '') {
        const requestIdAttr = requestId || Date.now();

        const headerText = headers
            .map(header => `<span class="header-line" data-header="${header.name}"><strong>${header.name}:</strong> ${header.value}</span>`)
            .join('\n');

        const formDataSection = formDataHTML ? `${formDataHTML}\n\n` : '';

        const section = createHeaderSection(type, requestIdAttr, headerText, data, url, statusCode, formDataSection, isFormDataBlock);

        const selectButton = createButton('Select', () => makeEditable(section));
        section.appendChild(selectButton);

        if ((type === 'Request' || type === 'Replayed Response') && requestBodyContent) {
            const requestBodyContainer = createRequestBodyContainer(requestBodyContent, headers);
            section.appendChild(requestBodyContainer);
        }

        if (type === 'Replayed Response') {
            section.classList.add('replayed-response');
        }

        headersContainer.appendChild(section);

        setTimeout(() => {
            headersContainer.scrollTop = headersContainer.scrollHeight;
        }, 100);
    }
});   
