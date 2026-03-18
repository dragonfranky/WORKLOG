// js/components/EditableText.js
import { renderHTML } from '../modules/utils.js';

const { ref, watch, nextTick, computed } = Vue;

// ⭐ 新增：全域記憶體，用來跨分頁記住「每一段文字」是否有被展開
const expandedMemory = new Map();

const template = `
    <div class="editable-text-container">
        <div v-if="isEditing" class="editor-wrapper">
            <div class="toolbar">
                <button class="btn-tool" style="background:#ffcdd2; color:#c62828; border-color:#e57373;" @click="addTag('red')">🅰️ 紅字</button>
                <button class="btn-tool" style="background:#fff9c4; color:#fbc02d; border-color:#fff176;" @click="addTag('yellow')">🟨 底色</button>
                <button class="btn-tool" style="background:#c8e6c9; color:#2e7d32; border-color:#81c784; margin-left:auto;" @click="finish">✅ 完成</button>
            </div>
            <textarea 
                ref="input" 
                v-model="localValue" 
                @blur="onBlur" 
                @input="adjustHeight"
                style="overflow-y: hidden; resize: none; width: 100%; min-height: 40px; box-sizing: border-box; padding: 8px; line-height: 14px;"
            ></textarea>
        </div>
        
        <div v-else class="preview-wrapper">
            <div :class="['preview-text', { 'collapsed-text': !isExpanded && isLong, 'has-long-content': isLong }]"
                 v-html="renderHTML(modelValue) || \`<span style='color:#ccc'>\${placeholder}</span>\`"
                 @click="startEdit"
                 style="cursor: text;">
            </div>
            
            <div v-if="isLong" 
                 class="toggle-btn" 
                 @click.stop="toggleExpand" 
                 style="font-size: 0.8rem; color: #1565c0; cursor: pointer; text-align: center; margin-top: 5px; background: #e3f2fd; border-radius: 4px; padding: 4px; font-weight: bold;">
                {{ isExpanded ? '▲ 收起內容' : '▼ 展開更多內容' }}
            </div>
        </div>
    </div>
`;

export default {
    template: template,
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
    setup(props, { emit }) {
        const isEditing = ref(false);
        const localValue = ref(props.modelValue);
        const input = ref(null);
        
        // ⭐ 修改：初始化時，去記憶庫中尋找這段文字先前的狀態，沒有則預設為 false
        const isExpanded = ref(expandedMemory.get(props.modelValue) || false);

        // 監聽外部文字更新 (包含編輯完成後，或者切換分頁 Vue 替換文字時)
        watch(() => props.modelValue, (newVal, oldVal) => { 
            localValue.value = newVal;
            
            // 判斷是「文字被修改」還是「切換頁面載入新資料」
            if (expandedMemory.has(newVal)) {
                // 如果是切換頁面，且新文字有記憶狀態，就套用記憶
                isExpanded.value = expandedMemory.get(newVal);
            } else if (oldVal && expandedMemory.has(oldVal)) {
                // 如果是使用者編輯了文字，就把舊的狀態轉移給新文字
                expandedMemory.set(newVal, isExpanded.value);
                expandedMemory.delete(oldVal); // 清除舊記憶
            } else {
                // 都沒有的話就維持預設
                isExpanded.value = false;
            }
        });
        
        // ⭐ 新增：按鈕點擊時切換狀態，並存入全域記憶體
        const toggleExpand = () => {
            isExpanded.value = !isExpanded.value;
            if (props.modelValue) {
                expandedMemory.set(props.modelValue, isExpanded.value);
            }
        };

        const isLong = computed(() => {
            const text = props.modelValue || "";
            const lines = text.split('\n').length;
            return lines > 2 || text.length > 100; // 配合您先前的設定保留為 2 行
        });

        const adjustHeight = () => {
            const el = input.value;
            if (el) {
                el.style.height = 'auto'; 
                el.style.height = el.scrollHeight + 'px'; 
            }
        };

        const startEdit = () => { 
            isEditing.value = true; 
            nextTick(() => { 
                // 保留先前修復 Electron 焦點丟失的 50 毫秒延遲
                setTimeout(() => {
                    if(input.value) {
                        input.value.focus();
                        adjustHeight(); 
                    }
                }, 50);
            }); 
        };

        const onBlur = (e) => { 
            if (e.relatedTarget && e.relatedTarget.closest('.toolbar')) return; 
            finish(); 
        };

        const finish = () => { 
            isEditing.value = false; 
            emit('update:modelValue', localValue.value); 
        };
        
        const addTag = (type) => {
            const ta = input.value;
            if (!ta) return;
            const start = ta.selectionStart; const end = ta.selectionEnd; const text = localValue.value || "";
            if (start === end) { alert("請先反白文字"); return; }
            const selected = text.substring(start, end);
            const open = type === 'red' ? '((' : '{{'; const close = type === 'red' ? '))' : '}}';
            localValue.value = text.substring(0, start) + open + selected + close + text.substring(end);
            nextTick(() => {
                input.value.focus();
                adjustHeight(); 
            });
        };
        
        return { 
            isEditing, localValue, input, startEdit, onBlur, finish, addTag, renderHTML, 
            adjustHeight, isExpanded, isLong, toggleExpand
        };
    }
};