<?php
/**
 * Main index template.
 *
 * @package logicaia-standalone
 */

get_header();
?>
<main class="site-main">
  <section class="hero">
    <h2><?php esc_html_e('Start Fresh with Logicaia', 'logicaia-standalone'); ?></h2>
    <p><?php esc_html_e('This standalone WordPress theme is ready for custom templates, blocks, and branding.', 'logicaia-standalone'); ?></p>
    <a class="button" href="#posts"><?php esc_html_e('View Latest Posts', 'logicaia-standalone'); ?></a>
  </section>

  <section id="posts" style="margin-top:1.25rem;" class="grid">
    <?php if (have_posts()) : ?>
      <?php while (have_posts()) : the_post(); ?>
        <article <?php post_class('card'); ?>>
          <h3><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h3>
          <?php the_excerpt(); ?>
        </article>
      <?php endwhile; ?>
    <?php else : ?>
      <article class="card">
        <h3><?php esc_html_e('No content yet', 'logicaia-standalone'); ?></h3>
        <p><?php esc_html_e('Create a post in WordPress admin to see it rendered here.', 'logicaia-standalone'); ?></p>
      </article>
    <?php endif; ?>
  </section>
</main>
<?php
get_footer();
