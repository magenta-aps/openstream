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
    collapseTrigger.classList.add(triggerOptions.classNames);
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
  onBtn.classList.add(...rootClassName, "toggle-btn-left", "toggle-btn-on");
  onBtn.innerHTML = onOptions.label;

  const offBtn = document.createElement("button");
  offBtn.classList.add(...rootClassName, "toggle-btn-right");
  offBtn.innerHTML = offOptions.label;

  /** @type {(event: Event, otherSwitch: HTMLButtonElement, fn: () => void)} */
  const switcher = (event, otherSwitch, fn) => {
    const target = event.target;
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
 */

/** @typedef {DropDownOptionsPrimitive & ComponentOptions} DropdownOptions */

/**
 * @param {DropdownOptions} dropdownOptions
 * @param {boolean} [indexItems=false] - if set to true, each item will be index by a "data-index" attribute
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
    return createDropdownItems(option, indexItems ? i : undefined);
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

  renderDropDownItems(popover.popover, optionElements);

  dropdown.appendChild(popover.trigger);
  dropdown.appendChild(popover.popover);

  return { dropdown, popover };
}

/**
 *
 * @param {DropdownOptions["options"][0]} option
 * @param {number} [index=false] - if set will add the specified index to a "data-index" attribute
 */
function createDropdownItems(option, index) {
  const attributes = [{ name: "data-value", value: String(option.value) }];
  if (index !== undefined) {
    attributes.push({ name: "data-index", value: String(index) });
  }

  const item = createElement("button", {
    classNames: ["os-dropdown-item"],
    attributes,
    content: option.name,
  });

  return item;
}

/**
 * @description
 * Will render the dropdown items into the dom
 * @param {HTMLDivElement} popover - The popover to insert the items into
 * @param {Array<HTMLButtonElement>} optionElements
 */
function renderDropDownItems(popover, optionElements) {
  const popoverContent = popover.querySelector(".os-dropdown-content");

  while (popoverContent.lastChild) {
    popoverContent.removeChild(popoverContent.lastChild);
  }

  // reverse so as to display elements asc from the bottom
  optionElements.reverse().forEach((optionElement) => {
    popoverContent.appendChild(optionElement);
  });
}

/** @typedef {{dropdown: HTMLDivElement}} Dropdown */

/**
 * @param {DropdownOptions} dropdownOptions
 * @returns {Dropdown}
 */
export function createDropdown(dropdownOptions) {
  const onUpdatePrimitive = dropdownOptions.onUpdate;
  /** @type (name: string) => void */
  const setTextOnUpdate = (name) => {
    popover.trigger.innerHTML = `
        <span>${name}</span>

        <i class="material-symbols-outlined">arrow_drop_down</i>
      `;
  };
  const { dropdown, popover } = createDropdownPrimitive({
    ...dropdownOptions,
    onUpdate: (name, value) => {
      setTextOnUpdate(name);
      onUpdatePrimitive(name, value);
    },
  });
  // set text initially
  setTextOnUpdate(dropdownOptions.options.at(0)?.name);

  return { dropdown };
}

/** @typedef {"set-max" | "set-value"} AltDropdownMode */
/** @typedef {{dropdown: HTMLDivElement, setMode: (mode: AltDropdownMode) => void}} DropdownAlt */

/**
 * @typedef {Object} AltDropdownFunctions
 * @property {(text: string) => void} AltDropdownFunctions.onTextUpdate
 * @property {(name: string, value: string) => void} AltDropdownFunctions.onUpdate
 * @property {() => void} AltDropdownFunctions.onSwitch
 * @property {() => void} AltDropdownFunctions.onRender
 */

/**
/* @typedef {Object} AltDropdownCtx
/* @property {AltDropdownMode} AltDropdownCtx.mode
/* @property {number} AltDropdownCtx.currentIndex
/* @property {AltDropdownFunctions["onTextUpdate"]} AltDropdownCtx.onTextUpdate
/* @property {AltDropdownFunctions["onUpdate"]} AltDropdownCtx.onUpdate
/* @property {AltDropdownFunctions["onRender"]} AltDropdownCtx.onRender
* @property {{index: number, name: string}} AltDropdownCtx.selected
* @property {{index: number, name: string}} AltDropdownCtx.max
/* @property {Array<{name: string, value: string}>} AltDropdownCtx.options
/* @property {Array<{name: string, value: string}>} AltDropdownCtx.availableOptions
*/

/**
 * @typedef {Object} AltDropdownOptionsPrimitive
 * @property {AltDropdownMode} mode - The mode that the alt dropdown will start in
 * @property {Array<{name: string, value: string, defaultMax?: boolean}>} options - The first element with "defaultMax=true" will be used as the default maximum, otherwise the last element is used
 */

/**
 * @typedef {AltDropdownOptionsPrimitive & DropdownOptions} AltDropdownOptions
 */

/**
 * @param {AltDropdownOptions} dropdownOptions
 * @returns {DropdownAlt}
 */
export function createAltDropdown(dropdownOptions) {
  const onUpdatePrimitive = dropdownOptions.onUpdate;
  /** @type {DropdownOptions["onUpdate"]} */
  const onUpdate = (name, value) => {
    ctx.onUpdate(name, value);

    onUpdatePrimitive(name, value);
  };

  const { dropdown, popover } = createDropdownPrimitive(
    {
      ...dropdownOptions,
      onUpdate,
    },
    true,
  );
  dropdown.classList.add("os-dropdown-alt");

  const defaultMax = {
    index: dropdownOptions.options.length - 1,
    name: dropdownOptions.options.at(-1)?.name,
  };
  const defaultMaxIndex = dropdownOptions.options.findIndex(
    (option) => option.defaultMax,
  );
  if (defaultMaxIndex >= 0) {
    defaultMax.index = defaultMaxIndex;
    defaultMax.name = dropdownOptions.options[defaultMaxIndex].name;
  }

  // init context
  /** @type {AltDropdownCtx} */
  const ctx = {
    mode: dropdownOptions.mode,
    currentIndex: 0,
    onTextUpdate: () => {},
    onUpdate: () => {},
    onRender: () => {},
    selected: {
      index: 0,
      name: dropdownOptions.options.at(0)?.name,
    },
    max: {
      index: defaultMax.index,
      name: defaultMax.name,
    },
    options: dropdownOptions.options,
    availableOptions: [],
  };

  // init available options
  ctx.availableOptions = dropdownOptions.options.filter(
    (_option, i) => i <= ctx.max.index,
  );

  /** @type {(mode: AltDropdownMode) => void} */
  const setMode = (mode) => {
    if (ctx.mode === mode) {
      return;
    }

    ctx.mode = mode;

    if (ctx.mode === "set-max") {
      setMax.onSwitch();
    } else {
      setValue.onSwitch();
    }
  };

  const setMax = createAltDropdownSetMax(ctx, popover, onUpdate);
  const setValue = createAltDropdownSetValue(ctx, popover, onUpdate);

  // init intial ctx functions
  if (ctx.mode === "set-max") {
    setMax.onSwitch();
  } else {
    setValue.onSwitch();
  }

  // set initial text
  ctx.onTextUpdate(ctx.selected.name);

  /** @type {(i: number) => void} */
  const onIncrDecr = (i) => {
    const target = dropdown.querySelector(`[data-index="${i}"]`);

    onUpdate(target.textContent, target.getAttribute("data-value"));
  };

  const incrementBtn = createElement("i", {
    classNames: ["arrow", "material-symbols-outlined"],
    content: "keyboard_arrow_up",
  });
  incrementBtn.addEventListener("click", () => {
    ctx.currentIndex += 1;
    const maxValue =
      ctx.mode === "set-max" ? ctx.options.length - 1 : ctx.max.index;

    if (ctx.currentIndex > maxValue) {
      ctx.currentIndex = 0;
    }

    onIncrDecr(ctx.currentIndex);
  });
  const decrementBtn = createElement("i", {
    classNames: ["arrow", "material-symbols-outlined"],
    content: "keyboard_arrow_down",
  });
  decrementBtn.addEventListener("click", () => {
    ctx.currentIndex -= 1;
    if (ctx.currentIndex < 0) {
      const size = (ctx.mode === "set-max" ? ctx.options : ctx.availableOptions)
        .length;
      ctx.currentIndex = size - 1;
    }

    onIncrDecr(ctx.currentIndex);
  });

  const arrowContainer = createElement("div", {
    classNames: ["arrow-container"],
  });
  arrowContainer.appendChild(incrementBtn);
  arrowContainer.appendChild(decrementBtn);

  dropdown.appendChild(arrowContainer);

  return { dropdown, setMode };
}

/**
 * @param {AltDropdownCtx} ctx
 * @param {{trigger: HTMLButtonElement, popover: HTMLDivElement}} popover
 * @param {DropdownOptions["onUpdate"]} onUpdatePrimitive
 * @returns {AltDropdownFunctions}}
 */
function createAltDropdownSetMax(ctx, popover, onUpdatePrimitive) {
  /** @type {AltDropdownFunctions["onTextUpdate"]} */
  const onTextUpdate = (text) => {
    popover.trigger.innerHTML = text;
  };

  /** @type {AltDropdownFunctions["onUpdate"]} */
  const onUpdate = (name, _value) => {
    ctx.max.index = ctx.options.findIndex((option) => option.name === name);
    ctx.max.name = name;

    ctx.availableOptions = ctx.options.filter(
      (_option, i) => i <= ctx.max.index,
    );

    ctx.onTextUpdate(ctx.max.name);
  };

  /** @type {AltDropdownFunctions["onSwitch"]} */
  const onSwitch = () => {
    ctx.onTextUpdate = onTextUpdate;
    ctx.onUpdate = onUpdate;
    ctx.onRender = onRender;

    ctx.currentIndex = ctx.max.index;
    ctx.onTextUpdate(ctx.max.name);
    ctx.onRender();
  };

  /** @type {AltDropdownFunctions["onRender"]} */
  const onRender = () => {
    const itemElements = ctx.options.map((option, i) =>
      createDropdownItems(option, i),
    );

    renderDropDownItems(popover.popover, itemElements);
  };

  return {
    onTextUpdate,
    onUpdate,
    onSwitch,
    onRender,
  };
}

/**
 * @param {AltDropdownCtx} ctx
 * @param {{trigger: HTMLButtonElement, popover: HTMLDivElement}} popover
 * @param {DropdownOptions["onUpdate"]} onUpdatePrimitive
 * @returns {AltDropdownFunctions}}
 */
function createAltDropdownSetValue(ctx, popover, onUpdatePrimitive) {
  /** @type {AltDropdownFunctions["onTextUpdate"]} */
  const onTextUpdate = (text) => {
    const formattedText = `<span class="os-dropdown-alt-input">${text} &nbsp;/&nbsp;</span> <span>${ctx.max.name}</span>`;

    popover.trigger.innerHTML = formattedText;
  };

  /** @type {AltDropdownFunctions["onUpdate"]} */
  const onUpdate = (name, value) => {
    ctx.selected.name = name;
    ctx.selected.index = ctx.availableOptions.findIndex(
      (option) => option.value === value,
    );

    ctx.onTextUpdate(name);
  };

  /** @type {AltDropdownFunctions["onSwitch"]} */
  const onSwitch = () => {
    ctx.onTextUpdate = onTextUpdate;
    ctx.onUpdate = onUpdate;
    ctx.onRender = onRender;

    if (ctx.max.index < ctx.selected.index) {
      ctx.selected.index = ctx.max.index;
      ctx.selected.name = ctx.max.name;
    }

    ctx.currentIndex = ctx.selected.index;
    ctx.onTextUpdate(ctx.selected.name);
    ctx.onRender();
  };

  /** @type {AltDropdownFunctions["onRender"]} */
  const onRender = () => {
    const itemElements = ctx.availableOptions.map((option, i) =>
      createDropdownItems(option, i),
    );

    renderDropDownItems(popover.popover, itemElements);
  };

  return {
    onTextUpdate,
    onUpdate,
    onSwitch,
    onRender,
  };
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
 * @returns {{container: HTMLDivElement, leftDropdown: DropdownMap[TLeft], rightDropdown: DropdownMap[TRight]}}
 */
export function createCoherentDropdown(leftOptions, rightOptions) {
  const coherentContainer = createElement("div", {
    classNames: ["os-dropdown-coherent"],
  });

  const leftDropdown = getDropdownFromType(leftOptions);

  const rightDropdown = getDropdownFromType(rightOptions);

  coherentContainer.appendChild(leftDropdown.dropdown);
  coherentContainer.appendChild(rightDropdown.dropdown);

  return { container: coherentContainer, leftDropdown, rightDropdown };
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
