// js/components/EditableText.js
import { renderHTML } from '../modules/utils.js';

// 取得全域 Vue (因為是使用 script 標籤引入)
const { ref, watch, nextTick } = Vue;

const template = `
    <div>
        <div v-if="isEditing" class="editor-wrapper">
            <div class="toolbar">
                <button class="btn-tool" style="background:#ffcdd2; color:#c62828; border-color:#e57373;" @click="addTag('red')">🅰️ 紅字</button>
                <button class="btn-tool" style="background:#fff9c4; color:#fbc02d; border-color:#fff176;" @click="addTag('yellow')">🟨 底色</button>
                <button class="btn-tool" style="background:#c8e6c9; color:#2e7d32; border-color:#81c784; margin-left:auto;" @click="finish">✅ 完成</button>
            </div>
            <textarea ref="input" v-model="localValue" @blur="onBlur"></textarea>
        </div>
        <div v-else class="preview-text" v-html="renderHTML(modelValue) || \`<span style='color:#ccc'>\${placeholder}</span>\`" @click="startEdit"></div>
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
        
        watch(() => props.modelValue, (newVal) => localValue.value = newVal);
        
        const startEdit = () => { isEditing.value = true; nextTick(() => { if(input.value) input.value.focus(); }); };
        const onBlur = (e) => { 
            if (e.relatedTarget && e.relatedTarget.closest('.toolbar')) return; 
            finish(); 
        };
        const finish = () => { isEditing.value = false; emit('update:modelValue', localValue.value); };
        
        const addTag = (type) => {
            const ta = input.value;
            if (!ta) return;
            const start = ta.selectionStart; const end = ta.selectionEnd; const text = localValue.value || "";
            if (start === end) { alert("請先反白文字"); return; }
            const selected = text.substring(start, end);
            const open = type === 'red' ? '((' : '{{'; const close = type === 'red' ? '))' : '}}';
            localValue.value = text.substring(0, start) + open + selected + close + text.substring(end);
            nextTick(() => input.value.focus());
        };
        
        return { isEditing, localValue, input, startEdit, onBlur, finish, addTag, renderHTML };
    }
};