// Mock implementation of framer-motion
const React = require('react');

// Mock the motion components
const motion = {
    div: (props) => React.createElement('div', props, props.children),
    header: (props) => React.createElement('header', props, props.children),
    h1: (props) => React.createElement('h1', props, props.children),
    p: (props) => React.createElement('p', props, props.children),
    button: (props) => React.createElement('button', props, props.children),
    footer: (props) => React.createElement('footer', props, props.children),
    label: (props) => React.createElement('label', props, props.children),
    h3: (props) => React.createElement('h3', props, props.children),
};

// Mock AnimatePresence
const AnimatePresence = ({children}) => children;

module.exports = {
    motion,
    AnimatePresence,
};