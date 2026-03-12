// js/components/EditableText.js
import { renderHTML } from '../modules/utils.js';

// 取得全域 Vue
const { ref, watch, nextTick, computed } = Vue;

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
                style="overflow-y: hidden; resize: none; width: 100%; min-height: 40px; box-sizing: border-box; padding: 8px; line-height: 1.5;"
            ></textarea>
        </div>
        
        <div v-else class="preview-wrapper">
            <div :class="['preview-text', { 'collapsed-text': !isExpanded && isLong }]"
                 v-html="renderHTML(modelValue) || \`<span style='color:#ccc'>\${placeholder}</span>\`"
                 @click="startEdit"
                 style="cursor: text;">
            </div>
            
            <div v-if="isLong" 
                 class="toggle-btn" 
                 @click.stop="isExpanded = !isExpanded" 
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
        
        // 新增：控制是否展開的狀態
        const isExpanded = ref(false);

        watch(() => props.modelValue, (newVal) => localValue.value = newVal);

        // 新增：自動判斷內容是否過長 (超過 4 行或超過 100 個字)
        const isLong = computed(() => {
            const text = props.modelValue || "";
            const lines = text.split('\n').length;
            return lines > 4 || text.length > 100;
        });

        // 新增：自動調整 Textarea 高度的核心邏輯
        const adjustHeight = () => {
            const el = input.value;
            if (el) {
                el.style.height = 'auto'; // 先重置高度，這樣刪除文字時才能順利縮小
                el.style.height = el.scrollHeight + 'px'; // 設定為捲軸內的實際高度
            }
        };

        const startEdit = () => { 
            isEditing.value = true; 
            nextTick(() => { 
                // ⏳ 新增 setTimeout 延遲 50 毫秒，破解 Electron 的幽靈焦點問題
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
                adjustHeight(); // 加上標籤後文字變長，重新調整高度
            });
        };
        
        return { 
            isEditing, localValue, input, startEdit, onBlur, finish, addTag, renderHTML, 
            adjustHeight, isExpanded, isLong 
        };
    }
};