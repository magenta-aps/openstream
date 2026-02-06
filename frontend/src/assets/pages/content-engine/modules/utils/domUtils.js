// SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
// SPDX-License-Identifier: AGPL-3.0-only
import { store } from "../core/slideStore.js";

// Helper function to get all persistent elements across all slides
export function getAllPersistentElements() {
  const persistentElements = [];
  store.slides.forEach((slide) => {
    slide.elements.forEach((element) => {
      if (element.isPersistent) {
        persistentElements.push(element);
      }
    });
  });
  return persistentElements;
}

// Helper function to get all elements that should be considered for zIndex calculation
export function getAllRelevantElements() {
  if (store.currentSlideIndex < 0) return [];

  // Get elements from current slide
  const currentSlideElements =
    store.slides[store.currentSlideIndex].elements || [];

  // Get all persistent elements from all slides
  const persistentElements = getAllPersistentElements();

  // Combine and deduplicate by element id
  const allElements = [...currentSlideElements];
  persistentElements.forEach((persistent) => {
    // Only add if not already in current slide elements
    if (!allElements.some((el) => el.id === persistent.id)) {
      allElements.push(persistent);
    }
  });

  return allElements;
}

export function getNewZIndex() {
  const allElements = getAllRelevantElements();
  if (allElements.length === 0) return 1;
  const nonAlwaysElements = allElements.filter((el) => !el.isAlwaysOnTop);
  if (nonAlwaysElements.length === 0) return 1;
  return Math.max(...nonAlwaysElements.map((el) => el.zIndex || 1)) + 1;
}

/**
 * @typedef {Object} ComponentOptions
 * @property {string} [Component.id]
 * @property {{name: string, value: string}[]} [Component.attributes]
 * @property {string[]} [Component.classNames]
 * @property {string} [Component.content] - be careful as this will be passed through innerHTML
 */

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {ComponentOptions} options
 */
function createElement(tag, options) {
  const element = document.createElement(tag);

  if (options.id) {
    element.id = options.id;
  }

  if (options.attributes && options.attributes.length > 0) {
    options.attributes.forEach((attribute) =>
      element.setAttribute(attribute.name, attribute.value),
    );
  }

  if (options.classNames?.length > 0) {
    element.classList.add(...options.classNames);
  }

  if (options.content) {
    element.innerHTML = options.content;
  }

  return element;
}

/**
 * @typedef {Object} PopoverOptions
 * @property {Object} PopoverOptions.position - determines how the popover is placed, see https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position-area#syntax
 * @property {string} PopoverOptions.position.row
 * @property {string} PopoverOptions.position.column
 */

/**
 * @description
 * Creates a popover that is compatible with the popover API.
 * @param {ComponentOptions} triggerOptions
 * @param {ComponentOptions & PopoverOptions} popoverOptions
 * @returns A trigger element for the popover as well as the popover itself
 */
export function createPopover(triggerOptions, popoverOptions) {
  const trigger = createElement("button", {
    ...triggerOptions,
    attributes: [
      ...(triggerOptions.attributes ?? []),
      { name: "popovertarget", value: popoverOptions.id },
    ],
  });

  const popover = createElement("div", {
    ...popoverOptions,
    attributes: [
      ...(popoverOptions.attributes ?? []),
      { name: "popover", value: "auto" },
    ],
  });
  popover.style.cssText = `position-area: ${popoverOptions.position.row} ${popoverOptions.position.column};`;

  return { trigger, popover };
}

/**
 * @description
 * Creates a bootstrap collapse element
 * @param {ComponentOptions} triggerOptions
 * @param {ComponentOptions} contentOptions
 * @returns A trigger for the collapse element as well as the collapse element itself
 */
export function createCollapse(triggerOptions, contentOptions) {
  const collapseOpendIcon =
    "<i class='material-symbols-outlined'>keyboard_arrow_up</i>";
  const collapseClosedIcon =
    "<i class='material-symbols-outlined'>keyboard_arrow_down</i>";
  let isCollapseOpen = true;

  const collapseTrigger = document.createElement("button");
  collapseTrigger.id = triggerOptions.id;
  collapseTrigger.type = "button";
  collapseTrigger.classList.add(
    "btn",
    "btn-sm",
    "w-100",
    "d-flex",
    "justify-content-between",
  );
  if (triggerOptions.classNames) {
    collapseTrigger.classList.add(...triggerOptions.classNames);
  }
  collapseTrigger.setAttribute("data-bs-toggle", "collapse");
  collapseTrigger.setAttribute("data-bs-target", `#${contentOptions.id}`);
  collapseTrigger.setAttribute("aria-expanded", contentOptions.id);
  collapseTrigger.setAttribute("aria-control", contentOptions.id);
  collapseTrigger.innerHTML = triggerOptions.content + collapseOpendIcon;

  const collapseContent = document.createElement("div");
  collapseContent.id = contentOptions.id;
  collapseContent.classList.add("collapse", "show");
  if (contentOptions.classNames) {
    collapseContent.classList.add(...contentOptions.classNames);
  }
  collapseContent.innerHTML = contentOptions.content;

  /** @type {(content: string) => void} */
  const setButtonContent = (icon) => {
    collapseTrigger.innerHTML = `
    ${triggerOptions.content}
    ${icon}
  `;
  };

  const setTextFolded = () => setButtonContent(collapseClosedIcon);
  const setTextExpanded = () => setButtonContent(collapseOpendIcon);

  collapseTrigger.addEventListener("click", () => {
    isCollapseOpen = !isCollapseOpen;
    if (isCollapseOpen) {
      setTextExpanded();
    } else {
      setTextFolded();
    }
  });

  return { trigger: collapseTrigger, content: collapseContent };
}

/**
 * @param {{ label: string, fn: () => void}} onOptions
 * @param {{ label: string, fn: () => void}} offOptions
 * @param {"sm"} [size]
 * @param {boolean} [isAlt] - determiens if the alt variant should be used
 * @returns
 */
export function createToggleButton(onOptions, offOptions, size, isAlt) {
  const rootClassName = ["toggle-btn", "toggle-btn-sm"];
  if (isAlt) {
    rootClassName.push("toggle-btn-alt");
  }

  if (size) {
    rootClassName.push("toggle-btn-sm");
  }

  const container = document.createElement("div");
  container.classList.add("toggle-btn-container");

  const onBtn = document.createElement("button");
  onBtn.classList.add(...rootClassName, "toggle-btn-on");
  onBtn.innerHTML = onOptions.label;

  const offBtn = document.createElement("button");
  offBtn.classList.add(...rootClassName);
  offBtn.innerHTML = offOptions.label;

  /** @type {(event: PointerEvent, otherSwitch: HTMLButtonElement, fn: () => void)} */
  const switcher = (event, otherSwitch, fn) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    if (target.classList.contains("toggle-btn-on")) {
      return;
    }

    fn();

    otherSwitch.classList.remove("toggle-btn-on");
    target.classList.add("toggle-btn-on");
  };

  onBtn.addEventListener("click", (event) =>
    switcher(event, offBtn, onOptions.fn),
  );
  offBtn.addEventListener("click", (event) =>
    switcher(event, onBtn, offOptions.fn),
  );

  container.appendChild(onBtn);
  container.appendChild(offBtn);

  return { container, onBtn, offBtn };
}

/**
 * @typedef {Object} DropDownOptionsPrimitive
 * @property {(name: string, value: string) => void} DropDownOptionsPrimitive.onUpdate
 * @property {Array<{name: string, value: string}>} DropDownOptionsPrimitive.options
 * @property {PopoverOptions["position"]} DropDownOptionsPrimitive.position
 * @property {boolean} [DropDownOptionsPrimitive.isDisabled]
 */

/** @typedef {DropDownOptionsPrimitive & ComponentOptions} DropdownOptions */

/**
 * @typedef {Object} DropdownPrimitive
 * @property {HTMLDivElement} DropdownPrimitive.element
 * @property {{trigger: HTMLButtonElement, popover: HTMLDivElement}} DropdownPrimitive.popover
 * @property {() => void} DropdownPrimitive.toggleDisabled
 * @property {(isDisabled: boolean) => void} DropdownPrimitive.setDisabledState
 */

/**
 * @param {DropdownOptions} dropdownOptions
 * @param {boolean} [indexItems=false] - if set to true, each item will be index by a "data-index" attribute
 * @returns {DropdownPrimitive}
 */
export function createDropdownPrimitive(dropdownOptions, indexItems = false) {
  const dropdown = createElement("div", {
    ...dropdownOptions,
    classNames: [...(dropdownOptions.classNames ?? []), "os-dropdown"],
  });

  const popover = createPopover(
    {
      classNames: ["os-dropdown-trigger"],
    },
    {
      id: crypto.randomUUID(),
      classNames: ["os-dropdown-popover"],
      position: dropdownOptions.position,
    },
  );

  const optionElements = dropdownOptions.options.map((option, i) => {
    const attributes = [{ name: "data-value", value: String(option.value) }];
    if (indexItems) {
      attributes.push({ name: "data-index", value: String(i) });
    }

    const item = createElement("button", {
      classNames: ["os-dropdown-item"],
      attributes,
      content: option.name,
    });

    return item;
  });

  const popoverContent = createElement("div", {
    classNames: ["os-dropdown-content"],
  });
  popoverContent.addEventListener("click", function (event) {
    const target = event.target;
    if (target instanceof HTMLButtonElement) {
      dropdownOptions.onUpdate(
        target.firstChild.textContent,
        target.getAttribute("data-value"),
      );
    }

    popover.popover.hidePopover();
  });
  popover.popover.appendChild(popoverContent);

  // reverse so as to display elements asc from the bottom
  optionElements.reverse().forEach((optionElement) => {
    popoverContent.appendChild(optionElement);
  });

  dropdown.appendChild(popover.trigger);
  dropdown.appendChild(popover.popover);

  let disabledState = dropdownOptions.isDisabled ?? false;
  const disabledClass = "os-dropdown-disabled";

  const enable = () => {
    dropdown.classList.remove(disabledClass);
    popover.trigger.disabled = false;
  };
  const disable = () => {
    dropdown.classList.add(disabledClass);
    popover.trigger.disabled = true;
  };

  /** @type {(isDisabled: boolean) => void} */
  const setDisabledState = (isDisabled) => {
    if (isDisabled === disabledState) {
      return;
    }
    disabledState = isDisabled;

    if (disabledState) {
      disable();
    } else {
      enable();
    }
  };

  const toggleDisabled = () => {
    if (disabledState) {
      enable();
    } else {
      disable();
    }
  };

  if (dropdownOptions.isDisabled) {
    disable();
  }

  return { element: dropdown, popover, toggleDisabled, setDisabledState };
}

/** @typedef {DropdownPrimitive} Dropdown */

/**
 * @param {DropdownOptions} dropdownOptions
 * @returns {Dropdown}
 */
export function createDropdown(dropdownOptions) {
  const onUpdatePrimitive = dropdownOptions.onUpdate;
  /** @type (name: string) => void */
  const setTextOnUpdate = (name) => {
    dropdown.popover.trigger.innerHTML = `
        <span>${name}</span>

        <i class="material-symbols-outlined">arrow_drop_down</i>
      `;
  };
  const dropdown = createDropdownPrimitive({
    ...dropdownOptions,
    onUpdate: (name, value) => {
      setTextOnUpdate(name);
      onUpdatePrimitive(name, value);
    },
  });
  // set text initially
  setTextOnUpdate(dropdownOptions.options.at(0)?.name);

  return dropdown;
}

/** @typedef {"reg" | "divided"} AltDropdownDisplayMode */
/** @typedef {DropdownPrimitive & {setDisplayMode: (mode: AltDropdownDisplayMode) => void}} DropdownAlt */

/**
 * @typedef {Object} AltDropdownOptionsPrimitive
 * @property {AltDropdownDisplayMode} displayMode - The mode that the alt dropdown will start in
 * @property {Array<{name: string, value: string, default?: boolean}>} options - The first element with "default=true" will be used as the default value, otherwise the first element is used
 */

/**
 * @typedef {AltDropdownOptionsPrimitive & DropdownOptions} AltDropdownOptions
 */

/**
 * @param {AltDropdownOptions} dropdownOptions
 * @returns {DropdownAlt}
 */
export function createAltDropdown(dropdownOptions) {
  /** @type {AltDropdownDisplayMode} */
  let displayMode = dropdownOptions.displayMode;

  const defaultIndex = dropdownOptions.options.findIndex(
    (option) => option.default,
  );
  let currentIndex = defaultIndex < 0 ? 0 : defaultIndex;

  const size = dropdownOptions.options.length;

  // sets a width when so the element does not changes it's width when the number take up too much space
  const setDisplayClass = () => {
    const trigger = dropdown.popover.trigger;

    if (displayMode === "reg") {
      trigger.classList.remove("os-dropdown-trigger-alt");
    } else {
      trigger.classList.add("os-dropdown-trigger-alt");
    }
  };

  /** @type {(mode: AltDropdownDisplayMode) => void} */
  const setDisplayMode = (mode) => {
    if (displayMode === mode) {
      return;
    }

    displayMode = mode;
    setDisplayClass();

    onTextupdate(dropdownOptions.options.at(currentIndex)?.name);
  };

  /** @type {(name: string) => void} */
  const onTextupdate = (name) => {
    /** @type {string} */
    let text;
    if (displayMode === "reg") {
      text = name;
    } else {
      text = `<span><span class="os-dropdown-alt-input">1 / &nbsp</span>${name}</span>`;
    }

    dropdown.popover.trigger.innerHTML = text;
  };

  const onUpdatePrimitive = dropdownOptions.onUpdate;
  /** @type {DropdownOptions["onUpdate"]} */
  const onUpdate = (name, value) => {
    currentIndex = dropdownOptions.options.findIndex(
      (option) => option.name === name,
    );

    onTextupdate(name);
    onUpdatePrimitive(name, value);
  };

  const dropdown = createDropdownPrimitive(
    {
      ...dropdownOptions,
      onUpdate,
    },
    true,
  );
  dropdown.element.classList.add("os-dropdown-alt");
  setDisplayClass();

  // init text
  onTextupdate(dropdownOptions.options.at(currentIndex)?.name);

  /** @type {(i: number) => void} */
  const onIncrDecr = (i) => {
    const target = dropdown.element.querySelector(`[data-index="${i}"]`);

    onUpdate(target.textContent, target.getAttribute("data-value"));
  };

  const onIncrement = () => {
    currentIndex += 1;

    if (currentIndex > size) {
      currentIndex = 0;
    }

    onIncrDecr(currentIndex);
  };

  const onDecrement = () => {
    currentIndex -= 1;
    if (currentIndex < 0) {
      currentIndex = size - 1;
    }

    onIncrDecr(currentIndex);
  };

  const incrDecrBtn = createElement("i", {
    classNames: ["arrow", "material-symbols-outlined"],
    content: "expand_all",
  });
  incrDecrBtn.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const targetHeight = target.offsetHeight;

    const clickY = event.offsetY;

    if (clickY < targetHeight / 2) {
      // arrow up logic
      onIncrement();
    } else {
      // arrow down logic
      onDecrement();
    }
  });
  const arrowContainer = createElement("div", {
    classNames: ["arrow-container"],
  });
  arrowContainer.appendChild(incrDecrBtn);

  dropdown.element.appendChild(arrowContainer);

  return { ...dropdown, setDisplayMode };
}

/**
 * @typedef {Object} DropdownOptionsMap
 * @property {DropdownOptions} reg
 * @property {AltDropdownOptions} alt
 */

/**
 * @typedef {Object} DropdownMap
 * @property {Dropdown} reg
 * @property {DropdownAlt} alt
 */

/**
 * @template {keyof DropdownMap} TLeft
 * @param {DropdownOptionsMap[TLeft] & {type: TLeft}} leftOptions
 * @template {keyof DropdownMap} TRight
 * @param {DropdownOptionsMap[TRight] & {type: TRight}} rightOptions
 * @param {boolean} [isDisabled] - Will override the disabled state of both dropdowns
 * @returns {{container: HTMLDivElement, leftDropdown: DropdownMap[TLeft], rightDropdown: DropdownMap[TRight], setDisabledState: (isDisabled: boolean) => void, toggleDisabled: () => void}}
 */
export function createCoherentDropdown(leftOptions, rightOptions, isDisabled) {
  const coherentContainer = createElement("div", {
    classNames: ["os-dropdown-coherent"],
  });

  if (isDisabled) {
    leftOptions.isDisabled = isDisabled;
    rightOptions.isDisabled = isDisabled;
  }

  const leftDropdown = getDropdownFromType(leftOptions);

  const rightDropdown = getDropdownFromType(rightOptions);

  /** @type {(isDisabled: boolean) => void} */
  const setDisabledState = (isDisabled) => {
    leftDropdown.setDisabledState(isDisabled);
    rightDropdown.setDisabledState(isDisabled);
  };

  const toggleDisabled = () => {
    leftDropdown.toggleDisabled();
    rightDropdown.toggleDisabled();
  };

  coherentContainer.appendChild(leftDropdown.element);
  coherentContainer.appendChild(rightDropdown.element);

  return {
    container: coherentContainer,
    leftDropdown,
    rightDropdown,
    setDisabledState,
    toggleDisabled,
  };
}

/**
 * @template {keyof DropdownMap} T
 * @param {DropdownOptionsMap[T] & {type: T}} options
 * @returns {DropdownMap[T]}
 */
function getDropdownFromType(options) {
  // jsdoc would not recognise any other way returning the correct type...
  /** @type {{ [K in keyof DropdownMap]: (options: DropdownOptionsMap[K] & {type: K}) => DropdownMap[K] }} */
  const builder = {
    reg: createDropdown,
    alt: createAltDropdown,
  };

  return builder[options.type](options);
}
