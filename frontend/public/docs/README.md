# Documentation writing guide

This folder contains the user documentation for OpenStream. This documentation is intented to make it easier for the user to learn about OpenStreams features and seek answers to common problems, when working with the program.

Each language available in the documentation has a folder, in which all the chapters has its own markdown file. The order of the chapters is determined in the documentaions main.js file, and the section numbering is rendered according to this order number. Therefore it is possible to use the normal markdown heading hierarchy when writing the documentation, e.g. #h1, ##h2, ###h3.

## Example of section numbering

**main.js:**
{
    slug: "File_Name",
    title: "Chapter 2 Name",
    order: 2,
}

**File_Name.md:**
```
# This is the title

## This is a subtitle

### And a third title
```

**Result:**
```
2. This is the title

2.1 This is a subtitle

2.1.1 And a third title
```