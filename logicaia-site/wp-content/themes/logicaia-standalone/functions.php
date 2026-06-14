<?php
/**
 * Theme functions for Logicaia Standalone.
 *
 * @package logicaia-standalone
 */

if (!defined('ABSPATH')) {
    exit;
}

function logicaia_standalone_setup(): void
{
    add_theme_support('title-tag');
    add_theme_support('post-thumbnails');
    add_theme_support('html5', ['search-form', 'gallery', 'caption', 'comment-form', 'comment-list', 'style', 'script']);

    register_nav_menus([
        'primary' => __('Primary Menu', 'logicaia-standalone'),
    ]);
}
add_action('after_setup_theme', 'logicaia_standalone_setup');

function logicaia_standalone_assets(): void
{
    wp_enqueue_style('logicaia-standalone-style', get_stylesheet_uri(), [], wp_get_theme()->get('Version'));
}
add_action('wp_enqueue_scripts', 'logicaia_standalone_assets');
