import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, type ChangeEvent, type InputHTMLAttributes, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from '../src/ui-base/Button';
import { ChoiceList } from '../src/ui-base/ChoiceList';
import { Dialog } from '../src/ui-base/Dialog';
import { Slider } from '../src/ui-base/Slider';
import { formatTime } from '../src/ui-base/TimeLabel';

function sliderElement(props: Parameters<typeof Slider>[0]) {
  return Slider(props) as ReactElement<InputHTMLAttributes<HTMLInputElement>>;
}

function change(valueAsNumber: number): ChangeEvent<HTMLInputElement> {
  return { currentTarget: { valueAsNumber } } as ChangeEvent<HTMLInputElement>;
}

test('shared slider reports bounded finite changes and remains controlled', () => {
  const changes: number[] = [];
  const element = sliderElement({ label: '音量', value: .4, min: 0, max: 1, step: .01, onValueChange: (value) => changes.push(value) });
  element.props.onChange?.(change(.7));
  element.props.onChange?.(change(10));
  element.props.onChange?.(change(-10));
  element.props.onChange?.(change(NaN));
  element.props.onChange?.(change(Infinity));
  assert.deepEqual(changes, [.7, 1, 0]);
  assert.equal(element.props.value, .4);
  assert.equal(element.props['aria-label'], '音量');
});

test('shared slider neutralizes invalid bounds and disabled input', () => {
  let changes = 0;
  const invalid = sliderElement({ label: '进度', value: Infinity, min: 5, max: -1, step: NaN, onValueChange: () => { changes += 1; } });
  assert.equal(invalid.props.value, 5);
  assert.equal(invalid.props.min, 5);
  assert.equal(invalid.props.max, 5);
  assert.equal(invalid.props.step, 1);
  assert.equal(invalid.props.disabled, true);
  invalid.props.onChange?.(change(5));
  const disabled = sliderElement({ label: '音量', value: .4, max: 1, disabled: true, onValueChange: () => { changes += 1; } });
  disabled.props.onChange?.(change(.7));
  assert.equal(changes, 0);
});

test('shared choices preserve stable option identity with custom presentation', () => {
  const selected: string[] = [];
  const items = [{ id: 'first', label: '接受', description: '前往约定地点' }] as const;
  const element = ChoiceList({ items, onChoose: (id) => selected.push(id), renderItem: (_item, index) => `自定义外观 ${index + 1}` });
  const button = element.props.children[0];
  assert.equal(button.type, Button);
  assert.equal(button.props['aria-label'], '接受');
  button.props.onClick();
  assert.deepEqual(selected, ['first']);
  const html = renderToStaticMarkup(element);
  assert.match(html, /type="button"/);
  assert.match(html, /自定义外观 1/);
});

test('dialog has an accessible title and configurable close control', () => {
  const html = renderToStaticMarkup(createElement(Dialog, { title: '设置', onClose() {}, closeLabel: '关闭设置', children: '内容' }));
  assert.match(html, /<dialog[^>]*aria-labelledby="[^"]+"/);
  assert.match(html, /aria-label="关闭设置"/);
  assert.match(html, /<h2[^>]*>设置<\/h2>/);
});

test('time formatting handles unloaded, invalid and long media durations', () => {
  assert.equal(formatTime(NaN), '00:00');
  assert.equal(formatTime(-20), '00:00');
  assert.equal(formatTime(61.9), '01:01');
  assert.equal(formatTime(3600), '60:00');
});
