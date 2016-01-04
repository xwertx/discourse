import ScreenTrack from 'discourse/lib/screen-track';
import { number } from 'discourse/lib/formatter';
import { fmt } from 'discourse/lib/computed';
import { isValidLink } from 'discourse/lib/click-track';


const PostView = Discourse.GroupedView.extend(Ember.Evented, {
  classNameBindings: ['selected'],

  templateName: function() {
    return (this.get('post.post_type') === this.site.get('post_types.small_action')) ? 'post-small-action' : 'post';
  }.property('post.post_type'),

  needsModeratorClass: function() {
    return (this.get('post.post_type') === this.site.get('post_types.moderator_action')) ||
           (this.get('post.topic.is_warning') && this.get('post.firstPost'));
  }.property('post.post_type'),

  _updateQuoteElements($aside, desc) {
    let navLink = "";
    const quoteTitle = I18n.t("post.follow_quote"),
          postNumber = $aside.data('post');

    if (postNumber) {

      // If we have a topic reference
      let topicId, topic;
      if (topicId = $aside.data('topic')) {
        topic = this.get('controller.content');

        // If it's the same topic as ours, build the URL from the topic object
        if (topic && topic.get('id') === topicId) {
          navLink = `<a href='${topic.urlForPostNumber(postNumber)}' title='${quoteTitle}' class='back'></a>`;
        } else {
          // Made up slug should be replaced with canonical URL
          navLink = `<a href='${Discourse.getURL("/t/via-quote/") + topicId + "/" + postNumber}' title='${quoteTitle}' class='quote-other-topic'></a>`;
        }

      } else if (topic = this.get('controller.content')) {
        // assume the same topic
        navLink = `<a href='${topic.urlForPostNumber(postNumber)}' title='${quoteTitle}' class='back'></a>`;
      }
    }
    // Only add the expand/contract control if it's not a full post
    let expandContract = "";
    if (!$aside.data('full')) {
      expandContract = `<i class='fa fa-${desc}' title='${I18n.t("post.expand_collapse")}'></i>`;
      $('.title', $aside).css('cursor', 'pointer');
    }
    $('.quote-controls', $aside).html(expandContract + navLink);
  },

  _toggleQuote($aside) {
    if (this.get('expanding')) { return; }

    this.set('expanding', true);

    $aside.data('expanded', !$aside.data('expanded'));

    const finished = () => this.set('expanding', false);

    if ($aside.data('expanded')) {
      this._updateQuoteElements($aside, 'chevron-up');
      // Show expanded quote
      const $blockQuote = $('blockquote', $aside);
      $aside.data('original-contents', $blockQuote.html());

      const originalText = $blockQuote.text().trim();
      $blockQuote.html(I18n.t("loading"));
      let topicId = this.get('post.topic_id');
      if ($aside.data('topic')) {
        topicId = $aside.data('topic');
      }

      const postId = parseInt($aside.data('post'), 10);
      topicId = parseInt(topicId, 10);

      Discourse.ajax(`/posts/by_number/${topicId}/${postId}`).then(result => {
        const div = $("<div class='expanded-quote'></div>");
        div.html(result.cooked);
        div.highlight(originalText, {caseSensitive: true, element: 'span', className: 'highlighted'});
        $blockQuote.showHtml(div, 'fast', finished);
      });
    } else {
      // Hide expanded quote
      this._updateQuoteElements($aside, 'chevron-down');
      $('blockquote', $aside).showHtml($aside.data('original-contents'), 'fast', finished);
    }
    return false;
  },

  // Show how many times links have been clicked on
  _showLinkCounts() {
    const self = this,
          link_counts = this.get('post.link_counts');

    if (!link_counts) { return; }

    link_counts.forEach(function(lc) {
      if (!lc.clicks || lc.clicks < 1) { return; }

      self.$(".cooked a[href]").each(function() {
        const $link = $(this),
              href = $link.attr('href');

        let valid = !lc.internal && href === lc.url;

        // this might be an attachment
        if (lc.internal) { valid = href.indexOf(lc.url) >= 0; }

        if (valid) {
          // don't display badge counts on category badge & oneboxes (unless when explicitely stated)
          if (isValidLink($link)) {
            $link.append("<span class='badge badge-notification clicks' title='" + I18n.t("topic_map.clicks", {count: lc.clicks}) + "'>" + number(lc.clicks) + "</span>");
          }
        }
      });
    });
  },

  actions: {

    // Toggle the replies this post is a reply to
    toggleReplyHistory(post) {
      const topicController = this.get('controller'),
            origScrollTop = $(window).scrollTop(),
            self = this;

      const stream = topicController.get('model.postStream');

      const replyHistory = [];
      if (replyHistory.length > 0) {
        const origHeight = this.$('.embedded-posts.top').height();

        replyHistory.clear();
        Em.run.next(function() {
          $(window).scrollTop(origScrollTop - origHeight);
        });
      } else {
        stream.findReplyHistory(post).then(function () {
          Em.run.next(function() {
            $(window).scrollTop(origScrollTop + self.$('.embedded-posts.top').height());
          });
        });
      }
    }
  },

  // Add the quote controls to a post
  _insertQuoteControls() {
    const self = this,
        $quotes = this.$('aside.quote');

    // Safety check - in some cases with cloackedView this seems to be `undefined`.
    if (Em.isEmpty($quotes)) { return; }

    $quotes.each(function(i, e) {
      const $aside = $(e);
      if ($aside.data('post')) {
        self._updateQuoteElements($aside, 'chevron-down');
        const $title = $('.title', $aside);

        // Unless it's a full quote, allow click to expand
        if (!($aside.data('full') || $title.data('has-quote-controls'))) {
          $title.on('click', function(e2) {
            if ($(e2.target).is('a')) return true;
            self._toggleQuote($aside);
          });
          $title.data('has-quote-controls', true);
        }
      }
    });
  },

  _destroyedPostView: function() {
    ScreenTrack.current().stopTracking(this.get('elementId'));
  }.on('willDestroyElement'),

  _postViewInserted: function() {
    const $post = this.$(),
          postNumber = this.get('post').get('post_number');

    this._showLinkCounts();

    ScreenTrack.current().track($post.prop('id'), postNumber);

    this.trigger('postViewInserted', $post);

    // Find all the quotes
    Em.run.scheduleOnce('afterRender', this, '_insertQuoteControls');

    this._applySearchHighlight();
  }.on('didInsertElement'),

  _fixImageSizes: function(){
    var maxWidth;
    this.$('img:not(.avatar)').each(function(idx,img){

      // deferring work only for posts with images
      // we got to use screen here, cause nothing is rendered yet.
      // long term we may want to allow for weird margins that are enforced, instead of hardcoding at 70/20
      maxWidth = maxWidth || $(window).width() - (Discourse.Mobile.mobileView ? 20 : 70);
      if (Discourse.SiteSettings.max_image_width < maxWidth) {
        maxWidth = Discourse.SiteSettings.max_image_width;
      }

      var aspect = img.height / img.width;
      if (img.width > maxWidth) {
        img.width = maxWidth;
        img.height = parseInt(maxWidth * aspect,10);
      }

      // very unlikely but lets fix this too
      if (img.height > Discourse.SiteSettings.max_image_height) {
        img.height = Discourse.SiteSettings.max_image_height;
        img.width = parseInt(maxWidth / aspect,10);
      }

    });
  }.on('willInsertElement'),

  _applySearchHighlight: function() {
    const highlight = this.get('searchService.highlightTerm');
    const cooked = this.$('.cooked');

    if (!cooked) { return; }

    if (highlight && highlight.length > 2) {
      if (this._highlighted) {
         cooked.unhighlight();
      }
      cooked.highlight(highlight.split(/\s+/));
      this._highlighted = true;

    } else if (this._highlighted) {
      cooked.unhighlight();
      this._highlighted = false;
    }
  }.observes('searchService.highlightTerm', 'cooked')
});

export default PostView;
