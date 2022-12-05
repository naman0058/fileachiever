;
(function($) {
    "use strict";
    //Mobile Menu
    jQuery('.stellarnav').stellarNav({
        theme: 'plain',
        breakpoint: 1023,
        menuLabel: '',
        sticky: false,
        position: 'static',
        openingSpeed: 80,
        closingDelay: 80,
        showArrows: true,
        closeBtn: false,
        closeLabel: 'Close',
        mobileMode: false,
        scrollbarFix: false
    });
    // Sticky Menu
    $(window).on('scroll', function() {
        var scroll = $(window).scrollTop();
        if (scroll < 100) {
            $("#sticky-header").removeClass("sticky-bar");
        } else {
            $("#sticky-header").addClass("sticky-bar");
        }
    });
    // Header Search
    if ($(".search-open").length) {
        $(".search-open").on("click", function(e) {
            e.preventDefault();
            $(".header-search-popup").toggleClass("active");
            $("body").toggleClass("locked");
        });
    }
    // Video Post PopUp
    if ($('.video-popup').length) {
        $('.video-popup').magnificPopup({
            disableOn: 700,
            type: 'iframe',
            mainClass: 'mfp-fade',
            removalDelay: 160,
            preloader: false,
            fixedContentPos: false
        });
    }
    // Post gallery 
    if ($('.post-gallerys').length) {
        $('.post-gallerys').slick({
            dots: false,
            infinite: true,
            speed: 700,
            cssEase: 'linear',
            autoplay: true,
            autoplaySpeed: 2000,
        });
    }
    // Limit Post Navication Title 
    if ($('.post-nav-container p').length) {
        $('.post-nav-container p').text($('.post-nav-container p').text().substring(0, 40));
    }

    $(window).on("load", function() {
        if ($(".preloader-area").length) {
            $(".preloader-area").fadeOut();
        }
    });
    // Bottom to top 
    $(window).on('scroll', function() {
        if ($(this).scrollTop() > 300) {
            $('#back-top').fadeIn();
        } else {
            $('#back-top').fadeOut();
        }
    });

    $('#back-top').on('click', function() {
        $("html, body").animate({
            scrollTop: 0
        }, 1000);
        return false;
    });
    if ($('.woo-spimg').length) {
        $('.woo-spimg').magnificPopup({
            delegate: 'a',
            type: 'image',
            mainClass: 'mfp-zoom-out', // this class is for CSS animation below
            gallery: { enabled: true },
            zoom: {
                enabled: true,
                duration: 300,
                easing: 'ease-in-out',
                opener: function(openerElement) {
                    return openerElement.is('img') ? openerElement : openerElement.find('img');
                }
            }
        });
    }
    if ($('.woo-product-big-img').length) {
        $('.woo-product-big-img').slick({
            slidesToShow: 1,
            slidesToScroll: 1,
            arrows: false,
            fade: true,
            asNavFor: '.woo-product-small-img'
        });
    }
    if ($('.woo-product-small-img').length) {
        $('.woo-product-small-img').slick({
            slidesToShow: 4,
            slidesToScroll: 1,
            asNavFor: '.woo-product-big-img',
            dots: true,
            arrows: false,
            focusOnSelect: true,
            centerMode: true,
            centerPadding: '60px',
        });
    }
    if ($('#restly-shop-view-mode li').length) {
        $('#restly-shop-view-mode li').on('click', function() {
            $('body').removeClass('restly-product-grid-view').removeClass('restly-product-list-view');

            if ($(this).hasClass('restly-shop-list')) {
                $('body').addClass('restly-product-list-view');
                Cookies.set('restly-shop-view', 'list');
            } else {
                $('body').addClass('restly-product-grid-view');
                Cookies.remove('restly-shop-view');
            }
            return false;
        });
    }
}(jQuery))