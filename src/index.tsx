import React from 'react';
import { createRoot } from 'react-dom/client';
import { settingsManager, WTrackerLiteSettings } from './components/Settings.js';

import { EventNames } from 'sillytavern-utils-lib/types';
import { AutoModeOptions } from 'sillytavern-utils-lib/types/translate';

declare const toastr: any;
import { ExtensionSettings, EXTENSION_KEY } from './config.js';
import { parseResponse } from './parser.js';
import { schemaToExample } from './schema-to-example.js';
import * as Handlebars from 'handlebars';
import { POPUP_RESULT, POPUP_TYPE } from 'sillytavern-utils-lib/types/popup';

// --- Constants and Globals ---
const CHAT_METADATA_SCHEMA_PRESET_KEY = 'schemaKey';
const CHAT_MESSAGE_SCHEMA_VALUE_KEY = 'value';
const CHAT_MESSAGE_SCHEMA_HTML_KEY = 'html';

const globalContext = SillyTavern.getContext();
const incomingTypes = [AutoModeOptions.RESPONSES, AutoModeOptions.BOTH];
const outgoingTypes = [AutoModeOptions.INPUT, AutoModeOptions.BOTH];

// --- Handlebars Helper ---
if (!Handlebars.helpers['join']) {
  Handlebars.registerHelper('join', function (array: any, separator: any) {
    if (Array.isArray(array)) {
      return array.join(typeof separator === 'string' ? separator : ', ');
    }
    return '';
  });
}

// --- Core Logic Functions (ported from original index.ts) ---

function renderTracker(messageId: number) {
  const message = globalContext.chat[messageId];
  const messageBlock = document.querySelector(`.mes[mesid="${messageId}"]`);
  messageBlock?.querySelector('.mes_wtrackerlite')?.remove();

  if (!message?.extra?.[EXTENSION_KEY]) return;

  const trackerData = message.extra[EXTENSION_KEY][CHAT_MESSAGE_SCHEMA_VALUE_KEY];
  const trackerHtmlSchema = message.extra[EXTENSION_KEY][CHAT_MESSAGE_SCHEMA_HTML_KEY];
  if (!trackerData || !trackerHtmlSchema) return;

  if (!messageBlock) return;

  const template = Handlebars.compile(trackerHtmlSchema, { noEscape: true, strict: true });
  const renderedHtml = template({ data: trackerData });
  const container = document.createElement('div');
  container.className = 'mes_wtrackerlite';
  container.innerHTML = renderedHtml;

  // Add controls
  const controls = document.createElement('div');
  controls.className = 'wtrackerlite-controls';
  controls.innerHTML = `
    <div class="wtrackerlite-regenerate-button fa-solid fa-arrows-rotate" title="Regenerate Tracker"></div>
    <div class="wtrackerlite-edit-button fa-solid fa-code" title="Edit Tracker Data"></div>
    <div class="wtrackerlite-delete-button fa-solid fa-trash-can" title="Delete Tracker"></div>
  `;
  container.prepend(controls);

  messageBlock.querySelector('.mes_text')?.before(container);
}

function toLabel(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

function formatTrackerForContext(data: any): string {
  const lines: string[] = ['[Scene Tracker]'];
  for (const [key, value] of Object.entries(data)) {
    const label = toLabel(key);
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${label}: (none)`);
      } else if (typeof value[0] !== 'object' || value[0] === null) {
        lines.push(`${label}: ${value.join(', ')}`);
      } else {
        lines.push(`${label}:`);
        for (const item of value) {
          const parts = Object.entries(item).map(([k, v]) => `${toLabel(k)}: ${v}`);
          lines.push(`  - ${parts.join(' | ')}`);
        }
      }
    } else {
      lines.push(`${label}: ${value}`);
    }
  }
  return lines.join('\n');
}

function includeWTrackerLiteMessages(messages: any[], settings: ExtensionSettings): any[] {
  const copyMessages = structuredClone(messages);
  if (settings.includeLastXWTrackerLiteMessages > 0) {
    for (let i = 0; i < settings.includeLastXWTrackerLiteMessages; i++) {
      let foundIndex = -1;
      for (let j = copyMessages.length - 2; j >= 0; j--) {
        // -2 to skip current message
        const message = copyMessages[j];
        if (!message.wTrackerFound && message.extra?.[EXTENSION_KEY]?.[CHAT_MESSAGE_SCHEMA_VALUE_KEY]) {
          message.wTrackerFound = true;
          foundIndex = j;
          break;
        }
      }
      if (foundIndex !== -1) {
        const trackerValue = copyMessages[foundIndex].extra[EXTENSION_KEY][CHAT_MESSAGE_SCHEMA_VALUE_KEY];
        const content = formatTrackerForContext(trackerValue);
        copyMessages.splice(foundIndex + 1, 0, { role: 'user', content, is_user: true, mes: content, is_system: false });
      }
    }
  }
  return copyMessages;
}

async function deleteTracker(messageId: number) {
  const message = globalContext.chat[messageId];
  if (!message?.extra?.[EXTENSION_KEY]) return;

  const confirm = await globalContext.Popup.show.confirm(
    'Delete Tracker',
    'Are you sure you want to delete the tracker data for this message? This cannot be undone.',
  );

  if (confirm) {
    delete message.extra[EXTENSION_KEY];
    await globalContext.saveChat();
    renderTracker(messageId); // This will remove the rendered tracker
    toastr.success('Tracker data deleted.');
  }
}

async function editTracker(messageId: number) {
  const message = globalContext.chat[messageId];
  if (!message?.extra?.[EXTENSION_KEY]?.[CHAT_MESSAGE_SCHEMA_VALUE_KEY]) return;

  const currentData = message.extra[EXTENSION_KEY][CHAT_MESSAGE_SCHEMA_VALUE_KEY];

  const popupContent = `
        <div style="display: flex; flex-direction: column; gap: 8px;">
            <label for="wtrackerlite-edit-textarea">Edit Tracker JSON:</label>
            <textarea id="wtrackerlite-edit-textarea" class="text_pole" rows="15" style="width: 100%; resize: vertical;"></textarea>
        </div>
    `;

  globalContext.callGenericPopup(popupContent, POPUP_TYPE.CONFIRM, 'Edit Tracker', {
    okButton: 'Save',
    onClose: async (popup) => {
      if (popup.result === POPUP_RESULT.AFFIRMATIVE) {
        const textarea = popup.content.querySelector('#wtrackerlite-edit-textarea') as HTMLTextAreaElement;
        if (textarea) {
          try {
            const newData = JSON.parse(textarea.value);
            // @ts-ignore
            message.extra[EXTENSION_KEY][CHAT_MESSAGE_SCHEMA_VALUE_KEY] = newData;
            await globalContext.saveChat();
            let detailsState: boolean[] = [];
            const messageBlock = document.querySelector(`.mes[mesid="${messageId}"]`);
            const existingTracker = messageBlock?.querySelector('.mes_wtrackerlite');
            if (existingTracker) {
              const detailsElements = existingTracker.querySelectorAll('details');
              detailsState = Array.from(detailsElements).map((detail) => detail.open);
            }
            renderTracker(messageId);
            if (detailsState.length > 0) {
              const newTracker = messageBlock?.querySelector('.mes_wtrackerlite');
              if (newTracker) {
                const newDetailsElements = newTracker.querySelectorAll('details');
                newDetailsElements.forEach((detail, index) => {
                  // Safety check: only apply if a state for this index exists
                  if (detailsState[index] !== undefined) {
                    detail.open = detailsState[index];
                  }
                });
              }
            }
            toastr.success('Tracker data updated.');
          } catch (e) {
            console.error('Error parsing new tracker data:', e);
            toastr.error('Invalid JSON. Changes were not saved.');
          }
        }
      }
    },
  });
  const textarea = document.querySelector('#wtrackerlite-edit-textarea') as HTMLTextAreaElement;
  if (textarea) {
    textarea.value = JSON.stringify(currentData, null, 2);
  }
}

async function generateTracker(id: number) {
  const context = SillyTavern.getContext();
  const message = context.chat[id];
  if (!message) return toastr.error(`Message with ID ${id} not found.`);

  if (context.extensionSettings.disabledExtensions?.includes('connection-manager')) {
    return toastr.error('The Connection Manager extension must be enabled to use WTrackerLite.');
  }

  const settings = settingsManager.getSettings();
  if (!settings.profileId) return toastr.error('Please select a connection profile in WTrackerLite settings.');

  const chatMetadata = context.chatMetadata;
  chatMetadata[EXTENSION_KEY] = chatMetadata[EXTENSION_KEY] || {};
  chatMetadata[EXTENSION_KEY][CHAT_METADATA_SCHEMA_PRESET_KEY] =
    chatMetadata[EXTENSION_KEY][CHAT_METADATA_SCHEMA_PRESET_KEY] || settings.schemaPreset;

  const chatJsonValue = settings.schemaPresets[settings.schemaPreset].value;
  const chatHtmlValue = settings.schemaPresets[settings.schemaPreset].html;

  const messageBlock = document.querySelector(`.mes[mesid="${id}"]`);
  const mainButton = messageBlock?.querySelector('.mes_wtrackerlite_button');
  const regenerateButton = messageBlock?.querySelector('.wtrackerlite-regenerate-button');

  let detailsState: boolean[] = [];
  const existingTracker = messageBlock?.querySelector('.mes_wtrackerlite');
  if (existingTracker) {
    const detailsElements = existingTracker.querySelectorAll('details');
    detailsState = Array.from(detailsElements).map((detail) => detail.open);
  }
  try {
    mainButton?.classList.add('spinning');
    regenerateButton?.classList.add('spinning');

    // Build chat history slice
    const startIndex = settings.includeLastXMessages > 0 ? Math.max(0, id - settings.includeLastXMessages) : 0;
    const chatSlice = context.chat.slice(startIndex, id + 1);

    // Inject previous tracker context messages into the slice
    const augmented = includeWTrackerLiteMessages(chatSlice, settings);

    // Convert to {role, content}[] for sendRequest
    const messages: { role: string; content: string }[] = augmented.map((msg: any) => ({
      role: msg.is_user || msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content || msg.mes || '',
    }));

    // Append the final JSON prompt
    const exampleResponse = schemaToExample(chatJsonValue);
    const finalPrompt = Handlebars.compile(settings.promptJson, { noEscape: true, strict: true })({
      schema: JSON.stringify(chatJsonValue, null, 2),
      example_response: exampleResponse,
    });
    messages.push({ role: 'user', content: finalPrompt });

    toastr.info('WTrackerLite: Generating tracker...');
    const result = await (context as any).ConnectionManagerRequestService.sendRequest(settings.profileId, messages);
    if (!result?.content) throw new Error('No response content received.');

    let response: object;
    try {
      response = parseResponse(result.content as string);
    } catch (parseError: any) {
      parseError.isParseError = true;
      toastr.error(`WTrackerLite: Failed to parse response — ${parseError.message}`);
      throw parseError;
    }

    if (!response || Object.keys(response as any).length === 0) throw new Error('Empty response from WTrackerLite.');

    // Tentatively update message and try to render
    message.extra = message.extra || {};
    message.extra[EXTENSION_KEY] = message.extra[EXTENSION_KEY] || {};
    message.extra[EXTENSION_KEY][CHAT_MESSAGE_SCHEMA_VALUE_KEY] = response;
    message.extra[EXTENSION_KEY][CHAT_MESSAGE_SCHEMA_HTML_KEY] = chatHtmlValue;

    try {
      renderTracker(id);

      if (detailsState.length > 0) {
        const newTracker = messageBlock?.querySelector('.mes_wtrackerlite');
        if (newTracker) {
          const newDetailsElements = newTracker.querySelectorAll('details');
          newDetailsElements.forEach((detail, index) => {
            // Safety check: only apply if a state for this index exists
            if (detailsState[index] !== undefined) {
              detail.open = detailsState[index];
            }
          });
        }
      }

      // If render succeeds, save the chat
      await context.saveChat();
    } catch (renderError) {
      // If render fails, remove the tracker data we just added
      delete message.extra[EXTENSION_KEY];
      // Re-render to clear the failed attempt from the DOM
      renderTracker(id);
      // Let the outer catch block show the error to the user
      throw new Error(`Generated data failed to render with the current template. Not saved.`);
    }
  } catch (error: any) {
    console.error('Error generating tracker:', error);
    if (!(error as any).isParseError) {
      toastr.error(`WTrackerLite: Generation failed — ${(error as Error).message}`);
    }
  } finally {
    mainButton?.classList.remove('spinning');
    regenerateButton?.classList.remove('spinning');
  }
}

// --- UI Initialization (Non-React parts) ---

async function initializeGlobalUI() {
  // Add WTrackerLite icon to message buttons
  const wTrackerIcon = document.createElement('div');
  wTrackerIcon.title = 'WTrackerLite';
  wTrackerIcon.className = 'mes_button mes_wtrackerlite_button fa-solid fa-truck-moving interactable';
  wTrackerIcon.tabIndex = 0;
  document.querySelector('#message_template .mes_buttons .extraMesButtons')?.prepend(wTrackerIcon);

  // Add global click listener for various tracker-related buttons on messages
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const messageEl = target.closest('.mes');

    if (!messageEl) return;
    const messageId = Number(messageEl.getAttribute('mesid'));
    if (isNaN(messageId)) return;

    if (target.classList.contains('mes_wtrackerlite_button')) {
      generateTracker(messageId);
    } else if (target.classList.contains('wtrackerlite-edit-button')) {
      editTracker(messageId);
    } else if (target.classList.contains('wtrackerlite-regenerate-button')) {
      generateTracker(messageId);
    } else if (target.classList.contains('wtrackerlite-delete-button')) {
      deleteTracker(messageId);
    }
  });

  const extensionsMenu = document.querySelector('#extensionsMenu');
  const buttonContainer = document.createElement('div');
  buttonContainer.id = 'wtrackerlite_menu_buttons';
  buttonContainer.className = 'extension_container';
  extensionsMenu?.appendChild(buttonContainer);
  buttonContainer.insertAdjacentHTML(
    'beforeend',
    `<div id="wtrackerlite_modify_schema_preset" class="list-group-item flex-container flexGap5">
      <div class="fa-solid fa-truck-moving extensionsMenuExtensionButton"></div>
      <span>Modify WTrackerLite schema</span>
    </div>`,
  );
  extensionsMenu?.querySelector('#wtrackerlite_modify_schema_preset')?.addEventListener('click', async () => {
    await modifyChatMetadata();
  });

  // Set up event listeners for auto-mode and chat changes
  globalContext.eventSource.on(EventNames.CHARACTER_MESSAGE_RENDERED, (messageId: number) => {
    const s = settingsManager.getSettings();
    if (s.skipFirst && globalContext.chat.length <= 1) return;
    if (incomingTypes.includes(s.autoMode)) generateTracker(messageId);
  });
  globalContext.eventSource.on(EventNames.USER_MESSAGE_RENDERED, (messageId: number) => {
    const s = settingsManager.getSettings();
    if (s.skipFirst && globalContext.chat.length <= 1) return;
    if (outgoingTypes.includes(s.autoMode)) generateTracker(messageId);
  });
  globalContext.eventSource.on(EventNames.CHAT_CHANGED, () => {
    const { saveChat } = globalContext;
    let chatModified = false;
    globalContext.chat.forEach((message, i) => {
      try {
        renderTracker(i);
      } catch (error) {
        console.error(`Error rendering WTrackerLite on message ${i}, removing data:`, error);
        toastr.error('A WTrackerLite template failed to render. Removing tracker from the message.');
        if (message?.extra?.[EXTENSION_KEY]) {
          delete message.extra[EXTENSION_KEY];
          chatModified = true;
        }
      }
    });
    if (chatModified) {
      saveChat();
    }
  });

  // Register the global generation interceptor
  (globalThis as any).wtrackerliteGenerateInterceptor = (chat: any[]) => {
    const newChat = includeWTrackerLiteMessages(chat, settingsManager.getSettings());
    chat.length = 0;
    chat.push(...newChat);
  };
}

async function modifyChatMetadata() {
  const settings = settingsManager.getSettings();
  const context = SillyTavern.getContext();
  const chatMetadata = context.chatMetadata;
  if (!chatMetadata[EXTENSION_KEY]) {
    chatMetadata[EXTENSION_KEY] = {};
  }
  if (!chatMetadata[EXTENSION_KEY][CHAT_METADATA_SCHEMA_PRESET_KEY]) {
    chatMetadata[EXTENSION_KEY][CHAT_METADATA_SCHEMA_PRESET_KEY] = 'default';
    context.saveMetadataDebounced();
  }
  const currentPresetKey = chatMetadata[EXTENSION_KEY][CHAT_METADATA_SCHEMA_PRESET_KEY];

  const presetOptions = Object.entries(settings.schemaPresets)
    .map(([key, preset]) => `<option value="${key}"${key === currentPresetKey ? ' selected' : ''}>${preset.name}</option>`)
    .join('');
  const popupContent = `<div style="display: flex; flex-direction: column; gap: 8px;">
    <label for="wtrackerlite-chat-schema-select">Select the schema preset for this chat:</label>
    <select id="wtrackerlite-chat-schema-select" class="text_pole">${presetOptions}</select>
  </div>`;

  await globalContext.callGenericPopup(popupContent, POPUP_TYPE.CONFIRM, '', {
    okButton: 'Save',
    onClose(popup) {
      if (popup.result === POPUP_RESULT.AFFIRMATIVE) {
        const selectElement = document.getElementById('wtrackerlite-chat-schema-select') as HTMLSelectElement;
        if (selectElement) {
          const newPresetKey = selectElement.value;
          if (newPresetKey !== currentPresetKey) {
            chatMetadata[EXTENSION_KEY][CHAT_METADATA_SCHEMA_PRESET_KEY] = newPresetKey;
            context.saveMetadataDebounced();
            toastr.success(`Chat schema preset updated to "${settings.schemaPresets[newPresetKey].name}".`);
          }
        }
      }
    },
  });
}

// --- Main Application Entry ---

function renderReactSettings() {
  const settingsContainer = document.getElementById('extensions_settings');
  if (!settingsContainer) {
    console.error('WTrackerLite: Extension settings container not found.');
    return;
  }

  let reactRootEl = document.getElementById('wtrackerlite-react-settings-root');
  if (!reactRootEl) {
    reactRootEl = document.createElement('div');
    reactRootEl.id = 'wtrackerlite-react-settings-root';
    settingsContainer.appendChild(reactRootEl);
  }

  const root = createRoot(reactRootEl);
  root.render(
    <React.StrictMode>
      <WTrackerLiteSettings />
    </React.StrictMode>,
  );
}

function main() {
  renderReactSettings();
  initializeGlobalUI();
}

settingsManager
  .initializeSettings()
  .then(main)
  .catch((error) => {
    console.error(error);
    toastr.error('WTrackerLite data migration failed. Check console for details.');
  });
