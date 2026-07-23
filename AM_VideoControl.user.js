// ==UserScript==
// @name           [AM] - Universal Video Control
// @name:ru        [AM] - Универсальный видео контрол
// @namespace      http://tampermonkey.net/
// @version        1.2.1
// @description    Rotate, mirrors, zoom video
// @description:ru Поворот, отражение, зум видео
// @author         Angel Metatron
// @license        MIT
// @icon           data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABY0lEQVR4nO2XMW7DMAxFySJ7sgWGAx/B58ohgi7tHdpTdcgRjBhCgC6dO7BDYEFiSUpMbCRDONkWzf9EUxINcGdD7wtE1JkBEQdPvJVXuGl3x4Jf7wEpZqBWmFsYT1UgJgARdV5hCcSCeFlSHOCSOatuxAyUxMN40sTM8SiKuFEBLPFS4BRE803FAdgqqBWfZqr5WBkioi6tCbUGpMBNu1PF+bjll1oE0Gafitea5JuAZUVpZuAacUVU9VkB+JZcOGxt0fezCMGeHYmoR8RB3Yql2YfDFvqP33UB8IdDWFZVhEvaE+AJgAC+Tai0DOH7K142n63qNh3T8TCSILwbUdiPmSi/5+IAhU9Qe7yKMJXvRABEHKY26lYIy5d3SFk/MMtx/Pa/x8k+iwXggbAsZm0/ZhBSf7hIS5b5JhD4Chs+rnbFczWlE4QkbgLMBVFqyx/7x+QakFphNwAHUQM6f07vbn8Pg/HDO/MKkAAAAABJRU5ErkJggg==
// @homepageURL    https://github.com/Angel-Metatron/AM_VideoControl
// @source         https://github.com/Angel-Metatron/AM_VideoControl.git
// @supportURL     https://github.com/Angel-Metatron/AM_VideoControl/issues
// @downloadURL    https://raw.githubusercontent.com/Angel-Metatron/AM_VideoControl/refs/heads/main/AM_VideoControl.user.js
// @updateURL      https://raw.githubusercontent.com/Angel-Metatron/AM_VideoControl/refs/heads/main/AM_VideoControl.user.js
// @match          *://*.youtube.com/*
// @match          *://*.anime-bit.ru/*
// @match          *://*/*
// @all-frames     true
// @grant          none
// ==/UserScript==

(function() {
    'use strict';

    // ================= БЛОК НАСТРОЕК КЛАВИШ =================
    const CONFIG = {
        // Клавиши для поворота на 90 градусов (английская и русская раскладки)
        keysRotate: ['r', 'R', 'к', 'К'],
        
        // Клавиши для горизонтального отражения
        keysMirrorHor: ['h', 'H', 'р', 'Р'],
        
        // Клавиши для вертикального отражения
        keysMirrorVert: ['v', 'V', 'м', 'М'],
        
        // Масштабирование кнопками
        // Уменьшение (Alt + Numpad +, или следующее)
        keyZoomPlus: 'add',       // Плюс на Numpad по умолчанию
        // Уменьшение (Alt + Numpad -, или следующее)
        keyZoomMinus: 'subtract', // Минус на Numpad по умолчанию
        // Сброс позиции и зума (Alt + Numpad 0, Alt + 0, Alt + NumpadInsert)
        keyZoomZero: 'decimal',   // Точка / Ноль на Numpad (для сброса) по умолчанию
        
        // Шаг зума при прокрутке и кнопках
        zoomStep: 0.05,
        
        // Минимальный и максимальный масштаб видео
        minZoom: 0.1,
        maxZoom: 10.0
    };
    // ========================================================

    // Карта для сохранения состояния каждого видео на странице
    // Структура: video -> { rot: 0, mHor: false, mVert: false, zoom: 1, tx: 0, ty: 0 }
    const videoStates = new Map();

    // Получить или инициализировать состояние для конкретного видео
    function getOrCreateState(video) {
        if (!videoStates.has(video)) {
            videoStates.set(video, {
                rot: 0,
                mHor: false,
                mVert: false,
                zoom: 1.0,
                tx: 0,
                ty: 0
            });
            initDragEvents(video);
        }
        return videoStates.get(video);
    }

    // Рассчитать и применить transform к видео
    function applyTransform(video, useTransition = false) {
        const state = getOrCreateState(video);
        
        const scaleX = (state.mHor ? -1 : 1) * state.zoom;
        const scaleY = (state.mVert ? -1 : 1) * state.zoom;
        
        let transformStr = `translate(${state.tx}px, ${state.ty}px) rotate(${state.rot}deg) scale(${scaleX}, ${scaleY})`;

        // Коррекция пропорций при повороте на 90 или 270 градусов, чтобы видео не обрезалось краями плеера
        if (state.rot === 90 || state.rot === 270) {
            const scaleFactor = video.clientHeight / video.clientWidth;
            if (scaleFactor > 0) {
                transformStr += ` scale(${scaleFactor})`;
            }
        }

        // Применяем плавность хода ТОЛЬКО если это явно вызвано горячей клавишей или колесиком
        if (useTransition && video.dataset.vIsDragging !== "true") {
            video.style.transition = 'transform 0.3s ease';
            
            // После завершения анимации убираем transition, чтобы при переключении fullscreen не было багов
            const onTransitionEnd = () => {
                video.style.transition = 'none';
                video.removeEventListener('transitionend', onTransitionEnd);
            };
            video.addEventListener('transitionend', onTransitionEnd);
        } else {
            video.style.transition = 'none';
        }

        video.style.transform = transformStr;
        // Сохраняем ожидаемую строку в dataset, чтобы контролировать сброс стилей плеером
        video.dataset.vExpectedTransform = transformStr;
    }

    // Инициализация событий мыши для перетаскивания (работает только при измененном зуме)
    function initDragEvents(video) {
        let isDragging = false;
        let startX = 0, startY = 0;
        let wasDragged = false;

        video.addEventListener('mousedown', function(e) {
            const state = getOrCreateState(video);
            // Перетаскивание работает только левой кнопкой мыши и только если видео смещено или масштабировано
            if (e.button === 0 && (state.zoom !== 1.0 || state.tx !== 0 || state.ty !== 0)) {
                isDragging = true;
                wasDragged = false;
                video.dataset.vIsDragging = "true"; // <-- ВКЛЮЧАЕМ РЕЖИМ ПЕРЕТАСКИВАНИЯ (вырубает transition)
                startX = e.clientX - state.tx;
                startY = e.clientY - state.ty;
                video.style.cursor = 'move';
                e.preventDefault();
            }
        });

        window.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            wasDragged = true;
            const state = getOrCreateState(video);
            state.tx = e.clientX - startX;
            state.ty = e.clientY - startY;
            applyTransform(video, false); // Перетаскивание всегда мгновенное
        });

        window.addEventListener('mouseup', function(e) {
            if (isDragging) {
                isDragging = false;
                video.dataset.vIsDragging = "false"; // <-- ВЫКЛЮЧАЕМ РЕЖИМ ПЕРЕТАСКИВАНИЯ
                video.style.cursor = '';
                if (wasDragged) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
        });

        // Блокируем стандартный клик паузы на YouTube, если мы просто перетаскивали экран
        video.addEventListener('click', function(e) {
            if (wasDragged) {
                e.preventDefault();
                e.stopPropagation();
                wasDragged = false;
            }
        }, true);
    }

    // Поиск активного видео
    function getActiveVideo() {
        const videos = document.querySelectorAll('video');
        if (videos.length === 0) return null;
        return Array.from(videos).find(v => v.currentTime > 0 && !v.paused) || videos[0];
    }

    // Обработчик горячих клавиш
    window.addEventListener('keydown', function(e) {
        // Игнорируем нажатия, если пользователь вводит текст
        if (document.activeElement.tagName === 'INPUT' || 
            document.activeElement.tagName === 'TEXTAREA' || 
            document.activeElement.isContentEditable) return;

        const video = getActiveVideo();
        if (!video) return;

        const state = getOrCreateState(video);
        let handled = false;

        // 1. Поворот (R)
        if (CONFIG.keysRotate.includes(e.key)) {
            state.rot = (state.rot + 90) % 360;
            handled = true;
        }
        // 2. Отражение по горизонтали (H)
        else if (CONFIG.keysMirrorHor.includes(e.key)) {
            state.mHor = !state.mHor;
            handled = true;
        }
        // 3. Отражение по вертикали (V)
        else if (CONFIG.keysMirrorVert.includes(e.key)) {
            state.mVert = !state.mVert;
            handled = true;
        }
        // 4. Увеличение (Alt + Numpad +)
        else if (e.altKey && (e.code === 'NumpadAdd' || e.key === CONFIG.keyZoomPlus)) {
            state.zoom = Math.min(CONFIG.maxZoom, state.zoom + CONFIG.zoomStep);
            handled = true;
        }
        // 5. Уменьшение (Alt + Numpad -)
        else if (e.altKey && (e.code === 'NumpadSubtract' || e.key === CONFIG.keyZoomMinus)) {
            state.zoom = Math.max(CONFIG.minZoom, state.zoom - CONFIG.zoomStep);
            handled = true;
        }
        // 6. Сброс позиции и зума (Alt + Numpad 0, Alt + 0, Alt + NumpadInsert, keyZoomZero из конфига)
        else if (e.altKey && (e.code === 'Numpad0' || e.code === 'NumpadInsert' || e.key === CONFIG.keyZoomZero || e.key === '0')) {
            state.zoom = 1.0;
            state.tx = 0;
            state.ty = 0;
            handled = true;
        }

        if (handled) {
            e.preventDefault();
            e.stopImmediatePropagation();
            applyTransform(video, true); // <--- ПЛАВНОСТЬ ВКЛЮЧЕНА для горячих клавиш
        }
    }, true);

    // Обработчик масштабирования колесиком мыши (Alt + Колесо)
    window.addEventListener('wheel', function(e) {
        if (!e.altKey) return;

        // Жестко перехватываем событие, предотвращая скролл страницы и открытие интерфейса YouTube
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const video = getActiveVideo();
        if (!video) return;

        const state = getOrCreateState(video);

        if (e.deltaY < 0) {
            // Крутим вверх — увеличиваем
            state.zoom = Math.min(CONFIG.maxZoom, state.zoom + CONFIG.zoomStep);
        } else {
            // Крутим вниз — уменьшаем
            state.zoom = Math.max(CONFIG.minZoom, state.zoom - CONFIG.zoomStep);
        }

        applyTransform(video, true); // <--- ПЛАВНОСТЬ ВКЛЮЧЕНА для скролла колесиком
    }, { passive: false, capture: true });

    // Постоянный мониторинг видео. Предотвращает сброс стилей плеерами и восстанавливает стили мгновенно при переходе в Fullscreen
    setInterval(() => {
        document.querySelectorAll('video').forEach(video => {
            const state = videoStates.get(video);
            if (state && video.dataset.vExpectedTransform) {
                // Если плеер принудительно изменил или сбросил transform, возвращаем его МГНОВЕННО (без плавности)
                if (video.style.transform !== video.dataset.vExpectedTransform) {
                    applyTransform(video, false); // <--- БЕЗ плавности для системных событий
                }
            }
        });
    }, 250);

})();
