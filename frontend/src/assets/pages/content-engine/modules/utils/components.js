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
    collapseContent.classList.add(contentOptions.classNames);
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
 * @property {(value: string) => void} onUpdate
 * @property {{name: string, value: string}[]} DropDownOptions.options
 * @property {(value: string) => void} onUpdate - runs when the a options is selected
 */

/** @typedef {DropDownOptionsPrimitive & ComponentOptions} DropDownOptions */

/**
 * @param {DropDownOptions} dropdownOptions
 * @param {PopoverOptions["position"]} [position={row: "bottom", "column": "center"}] - The position of the popup
 */
export function createDropdownPrimitive(
  dropdownOptions,
  position = { row: "bottom", column: "center" },
) {
  const dropdown = createElement("div", {
    ...dropdownOptions,
    classNames: [...(dropdownOptions.classNames ?? []), "os-dropdown"],
  });

  const optionElements = dropdownOptions.options.map((option) => {
    const item = createElement("button", {
      classNames: ["os-dropdown-item"],
      attributes: [{ name: "data-value", value: option.value }],
      content: option.name,
    });

    /** @type {(event: Event) => void} */
    const onUpdatePrimitive = (event) => {
      const target = event.target;
      popover.trigger.textContent = target.textContent;

      dropdownOptions.onUpdate(
        target.firstChild.textContent,
        target.getAttribute("data-value"),
      );

      popover.popover.hidePopover();
    };

    item.addEventListener("click", onUpdatePrimitive);

    return item;
  });

  const popover = createPopover(
    {
      classNames: ["os-dropdown-trigger"],
    },
    {
      id: crypto.randomUUID(),
      classNames: ["os-dropdown-popover"],
      position: position,
    },
  );

  const popoverContent = createElement("div", {
    classNames: ["os-dropdown-content"],
  });
  popover.popover.appendChild(popoverContent);

  optionElements.forEach((optionElement) =>
    popoverContent.appendChild(optionElement),
  );

  dropdown.appendChild(popover.trigger);
  dropdown.appendChild(popover.popover);

  return { dropdown, popover };
}

/**
 * @param {DropDownOptions} dropdownOptions
 * @param {PopoverOptions["position"]} [positionLeft={row: "bottom", "column": "center"}] - The position of the popup
 */
export function createDropdown(dropdownOptions, position) {
  const onUpdatePrimitive = dropdownOptions.onUpdate;
  const setTextOnUpdate = (name, value) => {
    popover.trigger.innerHTML = `
        <span>${name}</span>

        <i class="material-symbols-outlined">arrow_drop_down</i>
      `;
  };
  const { dropdown, popover } = createDropdownPrimitive(
    {
      ...dropdownOptions,
      onUpdate: (name, value) => {
        setTextOnUpdate(name, value);
        onUpdatePrimitive(name, value);
      },
    },
    position,
  );
  // set text initially
  setTextOnUpdate(dropdownOptions.options.at(0)?.name);

  return dropdown;
}

/**
 * @param {DropDownOptions} dropdownOptions
 * @param {PopoverOptions["position"]} [positionLeft={row: "bottom", "column": "center"}] - The position of the popup
 */
export function createAltDropdown(dropdownOptions, position) {
  const onUpdatePrimitive = dropdownOptions.onUpdate;
  const setTextOnUpdate = (name, value) => {
    popover.trigger.innerHTML = `
          <span>${name}</span>

          <div class="d-flex flex-column">
            <i class="material-symbols-outlined">keyboard_arrow_up</i>
            <i class="material-symbols-outlined">keyboard_arrow_down</i>
          </div>
          `;
  };

  const { dropdown, popover } = createDropdownPrimitive(
    {
      ...dropdownOptions,
      onUpdate: (name, value) => {
        setTextOnUpdate(name, value);
        onUpdatePrimitive(name, value);
      },
    },
    position,
  );
  // set text initially
  setTextOnUpdate(dropdownOptions.options.at(0)?.name);

  return dropdown;
}

/** @typedef {DropDownOptions & {type: "reg" | "alt"}} DropdownOptionsWithType */

/**
 * @param {DropdownOptionsWithType} leftOptions
 * @param {PopoverOptions["position"]} [positionLeft={row: "bottom", "column": "center"}] - The position of the popup
 * @param {DropdownOptionsWithType} rightOptions
 * @param {PopoverOptions["position"]} [positionRight={row: "bottom", "column": "center"}] - The position of the popup
 */
export function createCoherentDropdown(
  leftOptions,
  positionLeft,
  rightOptions,
  positionRight,
) {
  const coherentContainer = createElement("div", {
    classNames: ["os-dropdown-coherent"],
  });

  const leftDropdown = getDropdownFromType(leftOptions, positionLeft);

  const rightDropdown = getDropdownFromType(rightOptions, positionRight);

  coherentContainer.appendChild(leftDropdown);
  coherentContainer.appendChild(rightDropdown);

  return coherentContainer;
}

/**
 * @param {DropdownOptionsWithType} options
 * @param {PopoverOptions["position"]} [positionLeft] - The position of the popup
 */
function getDropdownFromType(options, position) {
  switch (options.type) {
    case "reg":
      return createDropdown(options, position);
    case "alt":
      return createAltDropdown(options, position);
  }
}
