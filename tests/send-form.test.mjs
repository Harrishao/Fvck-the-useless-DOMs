import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(__dirname, '..', '主版本v2', 'content.js');
const source = fs.readFileSync(sourcePath, 'utf8');

test('GROUPS 包含 sendForm 输入框区域定义', () => {
  assert.match(source, /id:\s*'sendForm'/);
  assert.match(source, /name:\s*'输入框区域'/);
  assert.match(source, /containers:\s*\[\s*'#leftSendForm'\s*,\s*'#rightSendForm'\s*\]/);
  assert.match(source, /supportsColumns:\s*true/);
});

test('包含 SEND_FORM_DEFAULT_LABELS 友好标签映射表', () => {
  assert.match(source, /SEND_FORM_DEFAULT_LABELS\s*=/);
  assert.match(source, /'#options_button':\s*'左下选项菜单'/);
  assert.match(source, /'#send_but':\s*'发送消息'/);
  assert.match(source, /'#extensionsMenuButton':\s*'扩展魔棒'/);
  assert.match(source, /'#mes_impersonate':\s*'让AI为您撰写消息'/);
  assert.match(source, /'#mes_continue':\s*'继续上一条消息'/);
  assert.match(source, /'#mes_stop':\s*'中止请求'/);
});

test('applyColumns 接收 (group, records) 并支持动态多栏容器', () => {
  assert.match(source, /function applyColumns\(\s*group\s*,\s*records\s*\)/);
  assert.match(source, /group\.containers/);
  assert.match(source, /doc\.querySelector\(\s*group\.containers\[0\]\s*\)/);
  assert.match(source, /doc\.querySelector\(\s*group\.containers\[1\]\s*\)/);
});

test('applyGroup 正确传入 group 至 applyColumns', () => {
  assert.match(source, /if\s*\(\s*group\.supportsColumns\s*\)\s*applyColumns\(\s*group\s*,\s*records\s*\)/);
});

test('renderBody 派发 sendForm 至 renderSendFormCard', () => {
  assert.match(source, /if\s*\(\s*group\.id\s*===\s*'sendForm'\s*\)\s*\{\s*html\s*\+=\s*renderSendFormCard\(/);
});

test('renderSendFormCard 渲染具有左右两栏的标准结构，且无独立的恢复默认按钮', () => {
  assert.match(source, /function renderSendFormCard\(\s*group\s*,\s*recs\s*,\s*map\s*\)/);
  assert.match(source, /data-col="0"/);
  assert.match(source, /data-col="1"/);
  assert.match(source, /左侧按钮/);
  assert.match(source, /右侧按钮/);
  assert.match(source, /mc3-mes-list/);
  assert.doesNotMatch(source, /data-action="reset-sendform"/);
});
